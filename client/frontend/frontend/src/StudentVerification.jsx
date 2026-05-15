import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import API from "./services/api";
import "./StudentVerification.css";

const initialForm = {
	parentFullName: "",
	parentMobile: "",
	parentOtp: "",
	parentAadhaarOrId: "",
	parentIncomeRange: "25000-50000",
	digitalConsent: false,
	esignName: "",
	emergencyContactName: "",
	emergencyContactPhone: "",
	rollNumber: "",
	officialEmail: "",
	collegeOtp: "",
	course: "",
	year: "",
	cgpa: "",
	attendance: "",
	monthlyAllowance: "",
	bankAccountNumber: "",
	ifscCode: "",
	upiHandle: "",
	autopayMandateStatus: "not_started",
	autopayMandateId: "",
	securityDepositAmount: "0",
	securityDepositRefundable: true,
	bankVerified: false,
	govtIdNumber: "",
	faceMatchScore: "",
	deviceFingerprint: "",
	simVerified: false,
	locationConsistencyScore: "",
	verificationNotes: "",
};

const initialFiles = {
	collegeIdUpload: null,
	bonafideCertificateUpload: null,
	studentSelfie: null,
	govtIdUpload: null,
};

const decisionLabels = {
	APPROVED_HIGH_LIMIT: { label: "Approved", tone: "success" },
	APPROVED_SMALL_LIMIT: { label: "Approved", tone: "success" },
	REQUIRE_DEPOSIT_OR_GUARANTOR: { label: "Rejected", tone: "warning" },
	REJECTED: { label: "Rejected", tone: "danger" },
};

const MAX_CONSECUTIVE_REPEAT = 4;
const MAX_DOMINANT_DIGIT_COUNT = 6;
const getMaxDigitFrequency = (value) => {
	const counts = new Map();
	for (const digit of String(value || "")) {
		counts.set(digit, (counts.get(digit) || 0) + 1);
	}

	return Math.max(0, ...counts.values());
};

const isValidParentAadhaar = (value) => {
	const aadhaar = String(value || "").trim();
	if (!/^\d{12}$/.test(aadhaar)) return false;
	if (/^([0-9])\1{11}$/.test(aadhaar)) return false;
	if (aadhaar.startsWith("0") || aadhaar.startsWith("1")) return false;

	let runLength = 1;
	const digitCounts = new Map();

	for (let index = 0; index < aadhaar.length; index += 1) {
		const currentDigit = aadhaar[index];
		digitCounts.set(currentDigit, (digitCounts.get(currentDigit) || 0) + 1);

		if (index > 0) {
			if (currentDigit === aadhaar[index - 1]) {
				runLength += 1;
				if (runLength >= MAX_CONSECUTIVE_REPEAT) return false;
			} else {
				runLength = 1;
			}
		}
	}

	if (Math.max(...digitCounts.values()) > MAX_DOMINANT_DIGIT_COUNT) return false;

	const digits = aadhaar.split("").map((digit) => Number(digit));
	const isAscendingSequence = digits.every((digit, index) => index === 0 || digit === ((digits[index - 1] + 1) % 10));
	const isDescendingSequence = digits.every((digit, index) => index === 0 || digit === ((digits[index - 1] + 9) % 10));

	return !isAscendingSequence && !isDescendingSequence;
};

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const fieldClass = (msgType, isFilled = false) => {
	const base = "student-field";
	if (msgType === "error") return `${base} student-field--error`;
	if (isFilled) return `${base} student-field--filled`;
	return base;
};

function ScoreChip({ label, value }) {
	return (
		<div className="student-score-chip">
			<span>{label}</span>
			<strong>{Math.round(Number(value || 0))}</strong>
		</div>
	);
}

export default function StudentVerification() {
	const navigate = useNavigate();
	const location = useLocation();
	const wizardRef = useRef(null);
	const [form, setForm] = useState(initialForm);
	const [files, setFiles] = useState(initialFiles);
	const [activeStep, setActiveStep] = useState(0);
	const [dashboard, setDashboard] = useState(null);
	const [decision, setDecision] = useState(null);
	const [message, setMessage] = useState("");
	const [msgType, setMsgType] = useState("info");
	const [isLoading, setIsLoading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [otpState, setOtpState] = useState({ parent: "", college: "" });
	const [sending, setSending] = useState({ parent: false, college: false });
	const [verifying, setVerifying] = useState({ parent: false, college: false });
	const [otpSuccessMessages, setOtpSuccessMessages] = useState({ parent: "", college: "" });
	const [aadhaarForm, setAadhaarForm] = useState({
		aadhaarNumber: "",
		aadhaarOtp: "",
		consentGiven: false,
	});
	const [parentAadhaarVerified, setParentAadhaarVerified] = useState(false);
	const [parentAadhaarMessage, setParentAadhaarMessage] = useState("");
	const [parentAadhaarMessageType, setParentAadhaarMessageType] = useState("info");
	const [mockAadhaarVerified, setMockAadhaarVerified] = useState(false);
	const [aadhaarOtpSent, setAadhaarOtpSent] = useState(false);

	const showMessage = (text, type = "info") => {
		setMessage(text);
		setMsgType(type);
	};

	const loadDashboard = async () => {
		try {
			setIsLoading(true);
			const response = await API.get("/student-verification/dashboard");
			setDashboard(response.data);
			if (response.data?.decision) {
				setDecision(response.data.decision);
			}
		} catch (err) {
			showMessage(err.response?.data?.message || "Unable to load student verification dashboard", "error");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadDashboard();
	}, []);

	useEffect(() => {
		if (location.state?.fromVerification) {
			setForm((prev) => ({
				...prev,
				parentFullName: location.state?.fullName || prev.parentFullName,
				parentMobile: location.state?.phoneNumber || prev.parentMobile,
			}));
		}
	}, [location.state]);

	const decisionKey = String(decision?.decision ?? dashboard?.user?.studentApprovalDecision ?? "REJECTED");
	const suggestedLimit = Number(decision?.suggestedBnplLimit ?? dashboard?.user?.studentSuggestedBnplLimit ?? 0);
	const autopayStatus = form.autopayMandateStatus || "not_started";
	const verificationStatus = String(dashboard?.user?.studentVerificationStatus || "draft");
	const parentStatus = form.parentMobile && form.digitalConsent && parentAadhaarVerified ? "Ready" : "Incomplete";

	const componentScores = useMemo(() => ({
		parentGuarantee: decision?.componentScores?.parentGuarantee ?? 0,
		collegeVerification: decision?.componentScores?.collegeVerification ?? 0,
		academicPerformance: decision?.componentScores?.academicPerformance ?? 0,
		financialStability: decision?.componentScores?.financialStability ?? 0,
		identityVerification: decision?.componentScores?.identityVerification ?? 0,
		aadhaarVerification: decision?.componentScores?.aadhaarVerification ?? 0,
		behavioralHistory: decision?.componentScores?.behavioralHistory ?? 0,
	}), [decision]);

	const isParentVerified = Boolean(dashboard?.verification?.parent?.mobileOtpVerified);
	const isCollegeVerified = Boolean(dashboard?.verification?.college?.officialEmailVerified);

	const aadhaarVerification = dashboard?.aadhaarVerification || dashboard?.user?.aadhaarVerification || dashboard?.verification?.identity?.aadhaarVerification || null;
	const isAadhaarVerified = mockAadhaarVerified || String(aadhaarVerification?.aadhaarVerificationStatus || dashboard?.user?.aadhaarVerificationStatus || "not_started") === "verified";

	const steps = useMemo(() => ([
		{
			key: "parent",
			number: 1,
			title: "Parent / Guardian Guarantee",
			description: "Verify the guardian who stands behind the BNPL obligation.",
			complete: Boolean(form.parentFullName && form.parentMobile && parentAadhaarVerified && form.parentIncomeRange && form.esignName && form.emergencyContactName && form.emergencyContactPhone && form.digitalConsent && isParentVerified),
		},
		{
			key: "college",
			number: 2,
			title: "Student College Verification",
			description: "Establish student status with official college records.",
			complete: Boolean(files.collegeIdUpload && form.rollNumber && files.bonafideCertificateUpload && form.officialEmail && form.course && form.year && form.cgpa && form.attendance && isCollegeVerified),
		},
		{
			key: "financial",
			number: 3,
			title: "Financial Surety",
			description: "Measure affordability and repayment automation.",
			complete: Boolean(form.monthlyAllowance && form.bankAccountNumber && form.ifscCode && form.upiHandle && form.bankVerified),
		},
		{
			key: "identity",
			number: 4,
			title: "Identity, Aadhaar & Review",
			description: "Verify the student identity and complete the Aadhaar check.",
			complete: Boolean(files.studentSelfie && files.govtIdUpload && form.govtIdNumber && form.deviceFingerprint && form.faceMatchScore && form.simVerified && isAadhaarVerified),
		},
	]), [form, files, isParentVerified, isCollegeVerified, isAadhaarVerified, parentAadhaarVerified]);

	const activeStepConfig = steps[activeStep];

	const goNextStep = () => {
		if (!activeStepConfig?.complete) {
			const missingFields = [];
			if (activeStep === 0) {
				if (!form.parentFullName) missingFields.push("Parent full name");
				if (!form.parentMobile) missingFields.push("Parent mobile");
				if (!isParentVerified) missingFields.push("Parent mobile verification");
				if (!parentAadhaarVerified) missingFields.push("Parent Aadhaar verification");
				if (!form.parentIncomeRange) missingFields.push("Parent income range");
				if (!form.esignName) missingFields.push("Digital consent");
				if (!form.emergencyContactName) missingFields.push("Emergency contact name");
				if (!form.emergencyContactPhone) missingFields.push("Emergency contact phone");
				if (!form.digitalConsent) missingFields.push("BNPL guarantee acknowledgement");
			} else if (activeStep === 1) {
				if (!files.collegeIdUpload) missingFields.push("College ID upload");
				if (!form.rollNumber) missingFields.push("Roll number");
				if (!files.bonafideCertificateUpload) missingFields.push("Bonafide certificate");
				if (!form.officialEmail) missingFields.push("Official college email");
				if (!isCollegeVerified) missingFields.push("College email verification");
				if (!form.course) missingFields.push("Course");
				if (!form.year) missingFields.push("Year");
				if (!form.cgpa) missingFields.push("CGPA");
				if (!form.attendance) missingFields.push("Attendance %");
			} else if (activeStep === 2) {
				if (!form.monthlyAllowance) missingFields.push("Monthly allowance");
				if (!form.bankAccountNumber) missingFields.push("Bank account number");
				if (!form.ifscCode) missingFields.push("IFSC code");
				if (!form.upiHandle) missingFields.push("UPI handle");
				if (!form.bankVerified) missingFields.push("Bank verification");
			} else if (activeStep === 3) {
				if (!files.studentSelfie) missingFields.push("Student selfie");
				if (!files.govtIdUpload) missingFields.push("Govt ID upload");
				if (!form.govtIdNumber) missingFields.push("Govt ID number");
				if (!form.faceMatchScore) missingFields.push("Face match score");
				if (!form.deviceFingerprint) missingFields.push("Device fingerprint");
				if (!form.simVerified) missingFields.push("SIM verification");
				if (!isAadhaarVerified) missingFields.push("Aadhaar verification");
			}
			showMessage(`Please complete: ${missingFields.join(", ")}`, "error");
			return;
		}

		setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
	};

	const goPreviousStep = () => {
		setActiveStep((prev) => Math.max(prev - 1, 0));
	};

	const startGuidedVerification = () => {
		setActiveStep(0);
		wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const goToStep = (stepIndex) => {
		setActiveStep(stepIndex);
		wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const handleChange = (event) => {
		const { name, value, type, checked } = event.target;
		setForm((prev) => ({
			...prev,
			[name]: type === "checkbox" ? checked : name === "parentAadhaarOrId" ? value.replace(/\D/g, "") : value,
		}));

		if (name === "parentAadhaarOrId") {
			setParentAadhaarVerified(false);
			setParentAadhaarMessage("");
			setParentAadhaarMessageType("info");
		}
	};

	const verifyParentAadhaarId = () => {
		const aadhaar = String(form.parentAadhaarOrId || "").trim();

		if (!/^\d+$/.test(aadhaar)) {
			setParentAadhaarMessage("Parent Aadhaar / ID must contain numeric values only");
			setParentAadhaarMessageType("error");
			setParentAadhaarVerified(false);
			return;
		}

		if (!isValidParentAadhaar(aadhaar)) {
			let errorMessage = "Parent Aadhaar / ID is invalid";

			if (!/^\d{12}$/.test(aadhaar)) {
				errorMessage = "Parent Aadhaar / ID must be exactly 12 digits";
			} else if (aadhaar.startsWith("0") || aadhaar.startsWith("1")) {
				errorMessage = "Parent Aadhaar / ID cannot start with 0 or 1";
			} else if (/^([0-9])\1{11}$/.test(aadhaar)) {
				errorMessage = "Parent Aadhaar / ID cannot contain all the same digits";
			} else if (/(\d)\1{3,}/.test(aadhaar)) {
				errorMessage = "Parent Aadhaar / ID cannot repeat the same digit too many times in a row";
			} else if (getMaxDigitFrequency(aadhaar) > MAX_DOMINANT_DIGIT_COUNT) {
				errorMessage = "Parent Aadhaar / ID cannot be dominated by one digit";
			} else if (/^(?:123456789012|234567890123)$/.test(aadhaar)) {
				errorMessage = "Parent Aadhaar / ID cannot contain a consecutive sequence";
			} else if (/^(?:987654321098|876543210987)$/.test(aadhaar)) {
				errorMessage = "Parent Aadhaar / ID cannot contain a reverse sequence";
			}

			setParentAadhaarMessage(errorMessage);
			setParentAadhaarMessageType("error");
			setParentAadhaarVerified(false);
			return;
		}

		setParentAadhaarVerified(true);
		setParentAadhaarMessage("Parent Aadhaar / ID successfully verified");
		setParentAadhaarMessageType("success");
	};

	const handleFileChange = (event) => {
		const { name, files: selectedFiles } = event.target;
		setFiles((prev) => ({
			...prev,
			[name]: selectedFiles?.[0] || null,
		}));
	};

	const sendParentOtp = async () => {
		try {
			setSending((prev) => ({ ...prev, parent: true }));
			const response = await API.post("/student-verification/parent-otp/send", {
				parentFullName: form.parentFullName,
				parentMobile: form.parentMobile,
			});
			const msg = response.data?.message || "Parent OTP sent";
			setOtpSuccessMessages((prev) => ({ ...prev, parent: msg }));
		} catch (err) {
			setOtpSuccessMessages((prev) => ({ ...prev, parent: "" }));
			showMessage(err.response?.data?.message || "Failed to send parent OTP", "error");
		} finally {
			setSending((prev) => ({ ...prev, parent: false }));
		}
	};

	const verifyParentOtp = async () => {
		try {
			setVerifying((prev) => ({ ...prev, parent: true }));
			const response = await API.post("/student-verification/parent-otp/verify", {
				parentMobile: form.parentMobile,
				otpCode: otpState.parent,
			});
			showMessage(response.data?.message || "Parent mobile verified", "success");
			setOtpSuccessMessages((prev) => ({ ...prev, parent: "OTP verified successfully" }));
			await loadDashboard();
			goToStep(1);
		} catch (err) {
			showMessage(err.response?.data?.message || "Invalid OTP", "error");
			setOtpSuccessMessages((prev) => ({ ...prev, parent: "" }));
		} finally {
			setVerifying((prev) => ({ ...prev, parent: false }));
		}
	};

	const sendCollegeOtp = async () => {
		try {
			setSending((prev) => ({ ...prev, college: true }));
			const response = await API.post("/student-verification/college-email/send", {
				officialEmail: form.officialEmail,
			});
			const msg = response.data?.message || "College email OTP sent";
			setOtpSuccessMessages((prev) => ({ ...prev, college: msg }));
		} catch (err) {
			setOtpSuccessMessages((prev) => ({ ...prev, college: "" }));
			showMessage(err.response?.data?.message || "Failed to send college email OTP", "error");
		} finally {
			setSending((prev) => ({ ...prev, college: false }));
		}
	};

	const verifyCollegeOtp = async () => {
		try {
			setVerifying((prev) => ({ ...prev, college: true }));
			const response = await API.post("/student-verification/college-email/verify", {
				officialEmail: form.officialEmail,
				otpCode: otpState.college,
			});
			showMessage(response.data?.message || "College email verified", "success");
			setOtpSuccessMessages((prev) => ({ ...prev, college: "OTP verified successfully" }));
			await loadDashboard();
			goToStep(2);
		} catch (err) {
			showMessage(err.response?.data?.message || "Invalid OTP", "error");
			setOtpSuccessMessages((prev) => ({ ...prev, college: "" }));
		} finally {
			setVerifying((prev) => ({ ...prev, college: false }));
		}
	};

	const initiateAadhaarVerification = async () => {
		const aadhaar = String(aadhaarForm.aadhaarNumber || "").trim();
		// If user entered a syntactically valid Aadhaar, use a local mock OTP flow
		if (isValidParentAadhaar(aadhaar)) {
			setIsSubmitting(true);
			setAadhaarOtpSent(true);
			showMessage("Mock Aadhaar OTP sent (enter any 4-digit code).", "success");
			setTimeout(() => setIsSubmitting(false), 600);
			return;
		}

		try {
			setIsSubmitting(true);
			const response = await API.post("/kyc/verify-aadhaar/initiate", {
				aadhaarNumber: aadhaarForm.aadhaarNumber,
				consentGiven: aadhaarForm.consentGiven,
			});
			showMessage(response.data?.message || "Aadhaar verification started", "success");
			setAadhaarOtpSent(false);
			await loadDashboard();
		} catch (err) {
			showMessage(err.response?.data?.message || "Failed to start Aadhaar verification", "error");
		} finally {
			setIsSubmitting(false);
		}
	};

	const verifyAadhaarOtp = async () => {
		// If a mock OTP was sent for a syntactically valid Aadhaar, accept any 4-digit OTP randomly
		const aadhaar = String(aadhaarForm.aadhaarNumber || "").trim();
		if (aadhaarOtpSent && /^\d{4}$/.test(String(aadhaarForm.aadhaarOtp || ""))) {
			setIsSubmitting(true);
			// random acceptance (~50%) to simulate non-deterministic verification
			const accepted = Math.random() >= 0.5;
			await new Promise((r) => setTimeout(r, 600));
			if (accepted) {
				setMockAadhaarVerified(true);
				setAadhaarOtpSent(false);
				showMessage("Mock Aadhaar verified successfully", "success");
				await loadDashboard();
			} else {
				showMessage("Mock OTP verification failed — try again", "error");
			}
			setIsSubmitting(false);
			return;
		}

		try {
			setIsSubmitting(true);
			const response = await API.post("/kyc/verify-aadhaar/otp", {
				aadhaarNumber: aadhaarForm.aadhaarNumber,
				opCode: aadhaarForm.aadhaarOtp,
				otpCode: aadhaarForm.aadhaarOtp,
			});
			showMessage(response.data?.message || "Aadhaar verified successfully", "success");
			await loadDashboard();
		} catch (err) {
			showMessage(err.response?.data?.message || "Failed to verify Aadhaar OTP", "error");
		} finally {
			setIsSubmitting(false);
		}
	};

	const refreshAadhaarStatus = async () => {
		try {
			const response = await API.get("/kyc/verify-aadhaar/status");
			showMessage(response.data?.status === "verified" ? "Aadhaar verification complete" : "Aadhaar verification is still pending", "info");
			await loadDashboard();
		} catch (err) {
			showMessage(err.response?.data?.message || "Failed to fetch Aadhaar status", "error");
		}
	};

	const evaluateProfile = async () => {
		try {
			setIsSubmitting(true);
			const response = await API.post("/student-verification/evaluate", {
				...form,
				parentMobile: form.parentMobile,
				monthlyAllowance: form.monthlyAllowance,
				securityDepositAmount: form.securityDepositAmount,
			});
			setDecision(response.data?.decision || null);
			showMessage("Student trust score evaluated successfully", "success");
		} catch (err) {
			showMessage(err.response?.data?.message || "Unable to evaluate student profile", "error");
		} finally {
			setIsSubmitting(false);
		}
	};

	const submitProfile = async () => {
		try {
			setIsSubmitting(true);
			const payload = new FormData();
			Object.entries(form).forEach(([key, value]) => {
				if (value === undefined || value === null) return;
				payload.append(key, typeof value === "boolean" ? String(value) : String(value));
			});
			Object.entries(files).forEach(([key, file]) => {
				if (file) payload.append(key, file);
			});

			const response = await API.post("/student-verification/submit", payload, {
				headers: { "Content-Type": "multipart/form-data" },
			});

			setDecision(response.data?.decision || null);
			const recommendation = String(response.data?.decision?.recommendation || "").toUpperCase();
			const isSuccess = recommendation === "APPROVED_HIGH_LIMIT" || recommendation === "APPROVED_SMALL_LIMIT";

			if (location.state?.fromVerification) {
				navigate(`/?studentVerification=${isSuccess ? "success" : "failed"}`, { replace: true });
				return;
			}

			showMessage(
				isSuccess ? "Student verification submitted and risk score updated" : "Student study BNPL not verified",
				isSuccess ? "success" : "error"
			);
			await loadDashboard();
		} catch (err) {
			if (location.state?.fromVerification) {
				navigate("/?studentVerification=failed", { replace: true });
				return;
			}
			showMessage(err.response?.data?.message || "Unable to submit student verification", "error");
		} finally {
			setIsSubmitting(false);
		}
	};

	const sendSummary = async () => {
		try {
			const response = await API.post("/student-verification/summary");
			showMessage(response.data?.message || "Summary emailed", "success");
		} catch (err) {
			showMessage(err.response?.data?.message || "Unable to send summary email", "error");
		}
	};

	const decisionMeta = decisionLabels[decisionKey] || decisionLabels.REJECTED;

	return (
		<div className="student-page">
			<section className="student-hero card">
				<div className="student-hero__copy">
					<div className="student-kicker">Student BNPL Surety & Repayment Verification</div>
					<h1 className="student-title">Studentcredit verification</h1>
					<p className="student-subtitle">
						Guardian, college, finance, identity.
					</p>
					<div className="student-hero__actions">
						<button type="button" className="btn-primary" onClick={startGuidedVerification} disabled={isSubmitting}>
							{isSubmitting ? "Loading…" : "Start verification"}
						</button>
						<button type="button" className="btn-secondary" onClick={sendSummary}>Email Summary</button>
						<Link to="/" className="btn-secondary btn-secondary--ghost">Back to Home</Link>
					</div>
				</div>

				<div className="student-score-card">
					<div className={`student-pill student-pill--${decisionMeta.tone}`}>{decisionMeta.label}</div>
					<div className="student-score-meta">
						<div><span>Status</span><strong>{verificationStatus}</strong></div>
						<div><span>Suggested limit</span><strong>{formatCurrency(suggestedLimit)}</strong></div>
					</div>
				</div>
			</section>

			{message && <div className={`student-alert student-alert--${msgType}`}>{message}</div>}

			<div className="student-grid">
				<div className="student-form-stack">
					<section ref={wizardRef} className="student-panel card student-step-panel">
						<div className="student-stepper" aria-label="Student BNPL steps">
							{steps.map((step, index) => (
								<button
									key={step.key}
									type="button"
									className={`student-stepper__item${index === activeStep ? " student-stepper__item--active" : ""}${step.complete ? " student-stepper__item--complete" : ""}`}
									onClick={() => setActiveStep(index)}
								>
									<span className="student-stepper__number">{step.number}</span>
									<span className="student-stepper__label">{step.title}</span>
								</button>
							))}
						</div>

						<div className="student-step-header">
							<div>
								<h2>{activeStepConfig.title}</h2>
								<p>{activeStepConfig.description}</p>
							</div>
							<span className={`badge ${activeStepConfig.complete ? "badge--success" : activeStep === 0 ? "badge--pending" : "badge--info"}`}>
								Step {activeStepConfig.number} of {steps.length}
							</span>
						</div>

						{activeStep === 0 && (
							<>
								<div className="student-form-grid">
									<label className={fieldClass(msgType, Boolean(form.parentFullName))}>
										<span>Parent full name</span>
										<input name="parentFullName" value={form.parentFullName} onChange={handleChange} placeholder="Parent / guardian name" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.parentMobile))}>
										<span>Parent mobile number</span>
										<div className="student-inline-actions">
											<input 
												name="parentMobile" 
												value={form.parentMobile} 
												onChange={handleChange} 
												placeholder="10-digit mobile" 
												maxLength="10" 
											/>
											<button type="button" className="chip-btn" onClick={sendParentOtp} disabled={sending.parent}>{sending.parent ? "Sending" : "Send OTP"}</button>
										</div>
										{otpSuccessMessages.parent && (
											<span className="student-field-note student-field-note--success">
												✓ {otpSuccessMessages.parent}
											</span>
										)}
									</label>
									<label className={fieldClass(msgType, Boolean(otpState.parent))}>
										<span>Parent OTP</span>
										<div className="student-inline-actions">
											<input value={otpState.parent} onChange={(e) => setOtpState((prev) => ({ ...prev, parent: e.target.value }))} placeholder="6-digit OTP" />
											<button type="button" className="chip-btn" onClick={verifyParentOtp} disabled={verifying.parent}>{verifying.parent ? "Verifying" : "Verify"}</button>
										</div>
									</label>
									<label className={fieldClass(msgType, Boolean(form.parentAadhaarOrId))}>
										<span>Parent Aadhaar / ID</span>
										<div className="student-inline-actions">
											<input
												name="parentAadhaarOrId"
												value={form.parentAadhaarOrId}
												onChange={handleChange}
												placeholder="12-digit Aadhaar number"
												inputMode="numeric"
												maxLength="12"
											/>
											<button type="button" className="chip-btn" onClick={verifyParentAadhaarId} disabled={!form.parentAadhaarOrId || isSubmitting}>
												{parentAadhaarVerified ? "Verified" : "Submit"}
											</button>
										</div>
										{parentAadhaarMessage && (
											<span className={`student-field-note student-field-note--${parentAadhaarMessageType}`}>
												{parentAadhaarMessage}
											</span>
										)}
									</label>
									<label className={fieldClass(msgType, Boolean(form.parentIncomeRange))}>
										<span>Parent income range</span>
										<select name="parentIncomeRange" value={form.parentIncomeRange} onChange={handleChange}>
											<option value="0-25000">0 - 25,000</option>
											<option value="25000-50000">25,000 - 50,000</option>
											<option value="50000-100000">50,000 - 1,00,000</option>
											<option value="100000-200000">1,00,000 - 2,00,000</option>
											<option value="200000+">2,00,000+</option>
										</select>
									</label>
									<label className={fieldClass(msgType, Boolean(form.esignName))}>
										<span>Digital consent / e-sign</span>
										<input name="esignName" value={form.esignName} onChange={handleChange} placeholder="Type full name as consent" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.emergencyContactName))}>
										<span>Emergency contact name</span>
										<input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} placeholder="Emergency contact" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.emergencyContactPhone))}>
										<span>Emergency contact phone</span>
										<input name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange} placeholder="10-digit number" maxLength="10" />
									</label>
								</div>
								<label className="student-checkline">
									<input type="checkbox" name="digitalConsent" checked={form.digitalConsent} onChange={handleChange} />
									<span>I confirm the guardian understands the BNPL guarantee obligation.</span>
								</label>
							</>
						)}

						{activeStep === 1 && (
							<div className="student-form-grid">
								<label className={fieldClass(msgType, Boolean(files.collegeIdUpload))}>
									<span>College ID upload</span>
									<input type="file" name="collegeIdUpload" onChange={handleFileChange} />
								</label>
								<label className={fieldClass(msgType, Boolean(form.rollNumber))}>
									<span>Roll number</span>
									<input name="rollNumber" value={form.rollNumber} onChange={handleChange} placeholder="Roll number" />
								</label>
								<label className={fieldClass(msgType, Boolean(files.bonafideCertificateUpload))}>
									<span>Bonafide certificate upload</span>
									<input type="file" name="bonafideCertificateUpload" onChange={handleFileChange} />
								</label>
								<label className={fieldClass(msgType, Boolean(form.officialEmail))}>
									<span>Official college email</span>
									<div className="student-inline-actions">
										<input 
											name="officialEmail" 
											value={form.officialEmail} 
											onChange={handleChange} 
											placeholder="name@college.edu" 
										/>
										<button type="button" className="chip-btn" onClick={sendCollegeOtp} disabled={sending.college}>{sending.college ? "Sending" : "Send OTP"}</button>
									</div>
									{otpSuccessMessages.college && (
										<span className="student-field-note student-field-note--success">
											✓ {otpSuccessMessages.college}
										</span>
									)}
								</label>
								<label className={fieldClass(msgType, Boolean(otpState.college))}>
									<span>College email OTP</span>
									<div className="student-inline-actions">
										<input value={otpState.college} onChange={(e) => setOtpState((prev) => ({ ...prev, college: e.target.value }))} placeholder="6-digit OTP" />
										<button type="button" className="chip-btn" onClick={verifyCollegeOtp} disabled={verifying.college}>{verifying.college ? "Verifying" : "Verify"}</button>
									</div>
								</label>
								<label className={fieldClass(msgType, Boolean(form.course))}>
									<span>Course</span>
									<input name="course" value={form.course} onChange={handleChange} placeholder="B.Tech / B.Com / BBA" />
								</label>
								<label className={fieldClass(msgType, Boolean(form.year))}>
									<span>Year</span>
									<select name="year" value={form.year} onChange={handleChange}>
										<option value="">Select year</option>
										<option value="1st">1st</option>
										<option value="2nd">2nd</option>
										<option value="3rd">3rd</option>
										<option value="4th">4th</option>
									</select>
								</label>
								<label className={fieldClass(msgType, Boolean(form.cgpa))}>
									<span>CGPA</span>
									<select name="cgpa" value={form.cgpa} onChange={handleChange}>
										<option value="">Select CGPA</option>
										<option value="0.0">0.0</option>
										<option value="1.0">1.0</option>
										<option value="1.5">1.5</option>
										<option value="2.0">2.0</option>
										<option value="2.5">2.5</option>
										<option value="3.0">3.0</option>
										<option value="3.5">3.5</option>
										<option value="4.0">4.0</option>
										<option value="4.5">4.5</option>
										<option value="5.0">5.0</option>
										<option value="5.5">5.5</option>
										<option value="6.0">6.0</option>
										<option value="6.5">6.5</option>
										<option value="7.0">7.0</option>
										<option value="7.5">7.5</option>
										<option value="8.0">8.0</option>
										<option value="8.5">8.5</option>
										<option value="9.0">9.0</option>
										<option value="9.5">9.5</option>
										<option value="10.0">10.0</option>
									</select>
								</label>
								<label className={fieldClass(msgType, Boolean(form.attendance))}>
									<span>Attendance %</span>
									<input name="attendance" value={form.attendance} onChange={handleChange} placeholder="0 - 100" type="number" min="0" max="100" />
								</label>
							</div>
						)}

						{activeStep === 2 && (
							<>
								<div className="student-form-grid">
									<label className={fieldClass(msgType, Boolean(form.monthlyAllowance))}>
										<span>Monthly allowance / stipend</span>
										<input name="monthlyAllowance" value={form.monthlyAllowance} onChange={handleChange} placeholder="Monthly support amount" type="number" min="0" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.bankAccountNumber))}>
										<span>Bank account verification</span>
										<input name="bankAccountNumber" value={form.bankAccountNumber} onChange={handleChange} placeholder="Account number" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.ifscCode))}>
										<span>IFSC code</span>
										<input name="ifscCode" value={form.ifscCode} onChange={handleChange} placeholder="IFSC" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.upiHandle))}>
										<span>UPI AutoPay mandate setup</span>
										<input name="upiHandle" value={form.upiHandle} onChange={handleChange} placeholder="name@upi" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.autopayMandateId))}>
										<span>AutoPay mandate ID</span>
										<input name="autopayMandateId" value={form.autopayMandateId} onChange={handleChange} placeholder="Mandate reference" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.securityDepositAmount))}>
										<span>Optional refundable security deposit</span>
										<input name="securityDepositAmount" value={form.securityDepositAmount} onChange={handleChange} placeholder="Deposit amount" type="number" min="0" />
									</label>
								</div>
								<div className="student-inline-checks">
									<label className="student-checkline">
										<input type="checkbox" name="bankVerified" checked={form.bankVerified} onChange={handleChange} />
										<span>Bank account verified externally</span>
									</label>
									<label className="student-checkline">
										<input type="checkbox" name="securityDepositRefundable" checked={form.securityDepositRefundable} onChange={handleChange} />
										<span>Deposit is refundable</span>
									</label>
								</div>
							</>
						)}

						{activeStep === 3 && (
							<div>
								<section className="student-aadhaar-card">
									<div className="student-panel__header">
										<div>
											<h3>Aadhaar KYC Verification</h3>
											<p>Send the Aadhaar OTP, verify it, and capture only the masked result.</p>
										</div>
										<div className="student-inline-actions">
											<span className={`badge ${isAadhaarVerified ? "badge--success" : "badge--info"}`}>
												{isAadhaarVerified ? "Verified" : String(aadhaarVerification?.aadhaarVerificationStatus || dashboard?.user?.aadhaarVerificationStatus || "not_started")}
											</span>
											<button type="button" className="btn-secondary" onClick={refreshAadhaarStatus}>Refresh</button>
										</div>
									</div>

									<div className="student-form-grid">
										<label className={fieldClass(msgType, Boolean(aadhaarForm.aadhaarNumber))}>
											<span>Aadhaar number</span>
											<input value={aadhaarForm.aadhaarNumber} onChange={(e) => setAadhaarForm((prev) => ({ ...prev, aadhaarNumber: e.target.value }))} placeholder="12-digit Aadhaar number" maxLength="12" />
										</label>

										<label className={fieldClass(msgType, Boolean(aadhaarForm.aadhaarOtp))}>
											<span>Aadhaar OTP</span>
											<div className="student-inline-actions student-inline-actions--otp">
												<input
													value={aadhaarForm.aadhaarOtp}
													onChange={(e) => setAadhaarForm((prev) => ({ ...prev, aadhaarOtp: e.target.value }))}
													placeholder={aadhaarOtpSent ? "4-digit OTP (mock)" : "6-digit OTP"}
													maxLength={aadhaarOtpSent ? 4 : 6}
													inputMode="numeric"
												/>
												<button type="button" className="btn-primary student-otp-verify-btn" onClick={verifyAadhaarOtp} disabled={isSubmitting}>{isSubmitting ? "Verifying" : "Verify OTP"}</button>
											</div>
											{aadhaarOtpSent && (
												<span className="student-field-note student-field-note--info">Mock OTP sent — enter any 4-digit code; verification is randomized.</span>
											)}
										</label>

										<label className={fieldClass(msgType, Boolean(aadhaarForm.consentGiven))}>
											<span>Consent</span>
											<div className="student-inline-actions student-inline-actions--tight">
												<label className="student-checkline student-checkline--compact">
													<input type="checkbox" checked={aadhaarForm.consentGiven} onChange={(e) => setAadhaarForm((prev) => ({ ...prev, consentGiven: e.target.checked }))} />
													<span>I consent to real-time Aadhaar KYC verification.</span>
												</label>
												<button type="button" className="btn-primary" onClick={initiateAadhaarVerification} disabled={!aadhaarForm.consentGiven || isSubmitting}>{isSubmitting ? "Sending" : "Send OTP"}</button>
											</div>
										</label>
									</div>

									<div className="student-summary-block student-aadhaar-summary">
										<div className="student-summary-row"><span>Masked Aadhaar</span><strong>{aadhaarVerification?.aadhaarMaskedNumber || dashboard?.user?.aadhaarMaskedNumber || "Pending"}</strong></div>
										<div className="student-summary-row"><span>Verified name</span><strong>{aadhaarVerification?.aadhaarVerifiedName || dashboard?.user?.aadhaarVerifiedName || "Pending"}</strong></div>
										<div className="student-summary-row"><span>Reference ID</span><strong>{aadhaarVerification?.aadhaarVerificationReferenceId || dashboard?.user?.aadhaarVerificationReferenceId || "Pending"}</strong></div>
																		<div className="student-summary-row"><span>BNPL eligibility</span><strong>{aadhaarVerification?.aadhaarBnplEligibility || dashboard?.user?.aadhaarBnplEligibility || "not_available"}</strong></div>
										<div className="student-summary-row"><span>Status</span><strong>{String(aadhaarVerification?.aadhaarVerificationStatus || dashboard?.user?.aadhaarVerificationStatus || "not_started")}</strong></div>
									</div>
								</section>

								<div className="student-form-grid">
									<label className={fieldClass(msgType, Boolean(files.studentSelfie))}>
										<span>Student selfie + face match</span>
										<input type="file" name="studentSelfie" onChange={handleFileChange} />
									</label>
									<label className={fieldClass(msgType, Boolean(files.govtIdUpload))}>
										<span>Aadhaar / Govt ID upload</span>
										<input type="file" name="govtIdUpload" onChange={handleFileChange} />
									</label>
									<label className={fieldClass(msgType, Boolean(form.govtIdNumber))}>
										<span>Govt ID number</span>
										<input name="govtIdNumber" value={form.govtIdNumber} onChange={handleChange} placeholder="Masked / last 4 digits" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.deviceFingerprint))}>
										<span>Device fingerprint</span>
										<input name="deviceFingerprint" value={form.deviceFingerprint} onChange={handleChange} placeholder="Device identifier" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.faceMatchScore))}>
										<span>Face match score</span>
										<input name="faceMatchScore" value={form.faceMatchScore} onChange={handleChange} placeholder="0 - 100" type="number" min="0" max="100" />
									</label>
									<label className={fieldClass(msgType, Boolean(form.locationConsistencyScore))}>
										<span>Location consistency check</span>
										<input name="locationConsistencyScore" value={form.locationConsistencyScore} onChange={handleChange} placeholder="0 - 100" type="number" min="0" max="100" />
									</label>
								</div>

								<div className="student-inline-checks">
									<label className="student-checkline">
										<input type="checkbox" name="simVerified" checked={form.simVerified} onChange={handleChange} />
										<span>SIM verification passed</span>
									</label>
								</div>

								<label className="student-field student-review-field">
									<span>Verification notes</span>
									<textarea name="verificationNotes" value={form.verificationNotes} onChange={handleChange} placeholder="Notes for underwriting or support" rows="4" />
								</label>
							</div>
						)}

						<div className="student-step-actions">
							<button type="button" className="btn-secondary" onClick={goPreviousStep} disabled={activeStep === 0}>Back</button>
							{activeStep < steps.length - 1 ? (
								<button type="button" className="btn-primary" onClick={goNextStep} disabled={isSubmitting || !activeStepConfig?.complete}>
									Next step
								</button>
							) : (
								<>
									<button type="button" className="btn-secondary" onClick={evaluateProfile} disabled={isSubmitting}>Refresh score</button>
									<button type="button" className="btn-primary" onClick={submitProfile} disabled={isSubmitting}>
										{isSubmitting ? "Submitting…" : "Submit for decision"}
									</button>
								</>
							)}
						</div>
					</section>
				</div>

				<aside className="student-sidebar">
					<section className="student-panel card student-sidebar__panel">
						<div className="student-panel__header">
							<div>
								<h2>Decision Summary</h2>
								<p>Approval outcome and underwriting explanation.</p>
							</div>
						</div>
						<div className="student-summary-block">
							<div className="student-summary-row"><span>Parent guarantee status</span><strong>{parentStatus}</strong></div>
							<div className="student-summary-row"><span>AutoPay status</span><strong>{autopayStatus}</strong></div>
							<div className="student-summary-row"><span>Aadhaar verified</span><strong>{isAadhaarVerified ? "Yes" : "No"}</strong></div>
							<div className="student-summary-row"><span>BNPL eligibility</span><strong>{decisionMeta.label}</strong></div>
							<div className="student-summary-row"><span>Suggested BNPL limit</span><strong>{formatCurrency(suggestedLimit)}</strong></div>
						</div>
						<div className="student-reason-box">
							<div className="student-reason-box__title">Decision</div>
							<p>{decisionMeta.label === "Approved" ? "Your loan has been approved." : "Your loan has been rejected."}</p>
						</div>
					</section>

					<section className="student-panel card student-sidebar__panel">
						<div className="student-panel__header">
							<div>
								<h2>Current Record</h2>
								<p>Latest persisted verification snapshot.</p>
							</div>
						</div>
						<pre className="student-json">{JSON.stringify({ status: verificationStatus, decision: decisionKey }, null, 2)}</pre>
						{isLoading && <div className="student-loading">Loading current verification…</div>}
					</section>
				</aside>
			</div>
		</div>
	);
}