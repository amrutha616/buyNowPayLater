/**
 * Referral Controller
 */

const ReferralProgram = require("../models/ReferralProgram");
const User = require("../models/userModel");
const crypto = require("crypto");
const { creditReward, getRewardConfig } = require("../services/rewardService");

exports.getReferralInfo = async (req, res) => {
	try {
		let referral = await ReferralProgram.findOne({ userId: req.user.id });

		if (!referral) {
			const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
			referral = await ReferralProgram.create({
				userId: req.user.id,
				referralCode,
			});
		}

		res.json({ referral });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.referUser = async (req, res) => {
	try {
		const { referralCode, referredEmail } = req.body;

		const referral = await ReferralProgram.findOne({ referralCode });
		if (!referral) {
			return res.status(404).json({ message: "Invalid referral code" });
		}

		// Add to referrals list (will activate after registration)
		referral.referrals.push({
			referredEmail,
			referredAt: new Date(),
			status: "pending",
		});

		await referral.save();
		res.json({ message: "Referral tracking initiated", referral });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.claimReferralBonus = async (req, res) => {
	try {
		const { referralCode } = req.body;

		const referral = await ReferralProgram.findOne({ referralCode });
		if (!referral) {
			return res.status(404).json({ message: "Invalid referral code" });
		}

		// Find matching referral and mark as active
		const ref = referral.referrals.find((r) => !r.bonusAwarded && r.referredEmail);

		if (!ref) {
			return res.status(400).json({ message: "No pending referrals to claim" });
		}

		ref.status = "active";
		ref.bonusAwarded = true;

		referral.totalReferrals = referral.referrals.filter((r) => r.bonusAwarded).length;
		const config = await getRewardConfig();
		const rewardAmount = Number(config.referralRewardAmount || referral.bonusPerReferral || 0);
		referral.totalBonusEarned += rewardAmount;

		const user = await User.findById(referral.userId).select("_id name email");
		if (!user) {
			return res.status(404).json({ message: "Referrer user not found" });
		}

		const reward = await creditReward({
			userId: user._id,
			amount: rewardAmount,
			source: "REFERRAL",
			note: `Referral bonus for ${ref.referredEmail || "referred user"}`,
			metadata: {
				referralCode,
				referredEmail: ref.referredEmail || null,
			},
		});

		await referral.save();

		res.json({
			message: `Bonus ₹${rewardAmount} added to your rewards wallet`,
			referral,
			reward,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
