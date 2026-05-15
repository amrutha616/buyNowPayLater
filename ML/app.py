from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import math
import uuid

import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent
RANDOM_SEED = 42
FEATURE_COLUMNS = [
    "monthly_income",
    "age",
    "employment_score",
    "existing_emi",
    "years_employed",
    "student_flag",
    "city_tier_score",
    "emi_to_income",
]
EMPLOYMENT_SCORE = {
    "government": 1.0,
    "private": 0.85,
    "self-employed": 0.72,
    "student": 0.42,
    "unemployed": 0.25,
}
CITY_TIER_SCORE = {
    1: 1.0,
    2: 0.92,
    3: 0.82,
    4: 0.68,
}

app = FastAPI(title="BNPL New ML Prediction API", version="1.0.0")


class PredictionRequest(BaseModel):
    customer_id: str = ""
    full_name: str = ""
    pan_number: str = ""
    monthly_income: float = Field(default=0, ge=0)
    age: int = Field(default=18, ge=18)
    employment_type: str = "Unemployed"
    existing_emi: float = Field(default=0, ge=0)
    years_employed: float = Field(default=0, ge=0)
    city_tier: str | None = ""
    is_student: bool = False
    risk_threshold: float = Field(default=72, ge=20, le=95)


class PredictionResult(BaseModel):
    trace_id: str
    approval_status: str
    approval_outcome: str
    eligibility_status: str
    assigned_credit_limit: float
    model_risk_percent: float
    model_credit_score: int
    risk_threshold: float
    threshold_breach: bool
    reasons: list[str]
    decision_source: str = "new_python_ml_service"


def normalize_employment_type(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"government", "govt", "salaried", "private", "working"}:
        return "private" if normalized != "government" else "government"
    if normalized in {"self-employed", "self employed", "self_employed"}:
        return "self-employed"
    if normalized == "student":
        return "student"
    return "unemployed"


def parse_city_tier(value: str | None) -> int:
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "tier1", "tier 1", "metro"}:
        return 1
    if normalized in {"2", "tier2", "tier 2"}:
        return 2
    if normalized in {"3", "tier3", "tier 3"}:
        return 3
    if normalized in {"4", "tier4", "tier 4"}:
        return 4
    return 3


@lru_cache(maxsize=1)
def build_model() -> Pipeline:
    """Load real BNPL dataset and train model on actual customer data."""
    try:
        # Try clean dataset first, fall back to original if not found
        dataset_paths = [
            BASE_DIR / "bnpl_dataset_clean.csv",  # Optimized dataset
            BASE_DIR / "bnpl_dataset_advanced_features.csv",  # Original dataset
        ]
        
        df = None
        used_path = None
        
        for path in dataset_paths:
            if path.exists():
                print(f"Loading dataset from: {path}")
                df = pd.read_csv(path)
                used_path = path
                print(f"[SUCCESS] Loaded {len(df)} records")
                break
        
        if df is None:
            print("[ERROR] No dataset found. Using synthetic data fallback.")
            return _build_synthetic_model()
        
        # Handle different dataset formats
        if "risk_label" in df.columns:
            # Clean dataset format. Ensure target=1 represents RISKY profiles (bad).
            df = df.dropna(subset=["monthly_income", "age", "employment_type", "risk_label"])
            # Some datasets encode low/high; map to risk: 1 if not 'low'
            target = (df["risk_label"].astype(str).str.lower() != "low").astype(int)
            
            # Ensure existing_emi exists
            if "existing_emi" not in df.columns:
                df["existing_emi"] = 0
        else:
            # Original dataset format
            df = df.dropna(subset=["monthly_income", "age", "employment_type", "risk"])
            # Original dataset: 0 = approved, 1 = rejected. Make target=1 => risky (rejected/non-zero)
            target = (df["risk"] != 0).astype(int)
            df["existing_emi"] = df.get("emi_delays", pd.Series(0)) * 1000 + (df.get("loan_amount", pd.Series(0)) * 0.15)
        
        # Normalize employment_type
        df["employment_type_normalized"] = df["employment_type"].apply(normalize_employment_type)
        
        employment_score = df["employment_type_normalized"].map(EMPLOYMENT_SCORE).fillna(0.5)
        
        # City tier proxy from has_property
        if "has_property" in df.columns:
            city_tier_proxy = df["has_property"].apply(lambda x: 1 if x > 0.5 else 3)
        else:
            city_tier_proxy = pd.Series(3, index=df.index)  # Default to tier 3
        
        city_tier_score = city_tier_proxy.map(CITY_TIER_SCORE).fillna(0.82)
        
        student_flag = (df["employment_type_normalized"] == "student").astype(float)
        
        # Calculate emi_to_income
        existing_emi = df["existing_emi"].fillna(0)
        emi_to_income = existing_emi / np.maximum(df["monthly_income"], 1)
        
        # Create features dataframe
        features = pd.DataFrame({
            "monthly_income": df["monthly_income"].astype(float),
            "age": df["age"].astype(int),
            "employment_score": employment_score.astype(float),
            "existing_emi": existing_emi.astype(float),
            "years_employed": df["years_employed"].fillna(0).astype(float),
            "student_flag": student_flag,
            "city_tier_score": city_tier_score.astype(float),
            "emi_to_income": emi_to_income.astype(float),
        })
        
        print(f"Training on {len(features)} samples")
        print(f"Class distribution: Approved={target.sum()}, Rejected={(1-target).sum()}")
        
        model = Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                ("classifier", LogisticRegression(max_iter=1200, class_weight="balanced", random_state=RANDOM_SEED)),
            ]
        )
        model.fit(features, target)
        print("[SUCCESS] Model trained successfully on real data")
        return model
        
    except Exception as e:
        print(f"[ERROR] Error loading dataset: {e}")
        print("[FALLBACK] Using synthetic data fallback.")
        return _build_synthetic_model()


def _build_synthetic_model() -> Pipeline:
    """Fallback: Generate synthetic data for model training."""
    rng = np.random.default_rng(RANDOM_SEED)
    sample_count = 6000

    monthly_income = rng.uniform(5000, 180000, sample_count)
    age = rng.integers(18, 60, sample_count)
    employment_type = rng.choice(
        ["government", "private", "self-employed", "student", "unemployed"],
        size=sample_count,
        p=[0.12, 0.42, 0.18, 0.16, 0.12],
    )
    years_employed = np.clip(rng.normal(4.5, 3.0, sample_count), 0, 20)
    existing_emi = np.clip(monthly_income * rng.uniform(0, 0.65, sample_count), 0, 120000)
    student_flag = (employment_type == "student").astype(float)
    city_tier = rng.choice([1, 2, 3, 4], size=sample_count, p=[0.22, 0.29, 0.31, 0.18])

    employment_score = np.vectorize(EMPLOYMENT_SCORE.get)(employment_type)
    city_tier_score = np.vectorize(CITY_TIER_SCORE.get)(city_tier)
    emi_to_income = np.divide(existing_emi, np.maximum(monthly_income, 1))
    loan_exposure = np.clip(emi_to_income * 1.4 + np.maximum(0, 0.8 - employment_score), 0, 2.5)

    risk_signal = (
        loan_exposure * 1.45
        + np.clip(emi_to_income - 0.15, 0, 1.0) * 1.35
        + np.where(age < 23, 0.42, 0.0)
        + np.where(age > 50, 0.18, 0.0)
        + np.where(years_employed < 1.0, 0.3, 0.0)
        + np.where(employment_type == "unemployed", 0.9, 0.0)
        + np.where(employment_type == "student", 0.35, 0.0)
        + np.where(city_tier == 4, 0.08, 0.0)
        - np.where(monthly_income > 75000, 0.15, 0.0)
        + rng.normal(0, 0.08, sample_count)
    )

    target = (risk_signal > 0.62).astype(int)

    features = pd.DataFrame(
        {
            "monthly_income": monthly_income,
            "age": age,
            "employment_score": employment_score,
            "existing_emi": existing_emi,
            "years_employed": years_employed,
            "student_flag": student_flag,
            "city_tier_score": city_tier_score,
            "emi_to_income": emi_to_income,
        },
        columns=FEATURE_COLUMNS,
    )

    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=1200, class_weight="balanced", random_state=RANDOM_SEED)),
        ]
    )
    model.fit(features, target)
    return model


MODEL = build_model()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_features(payload: PredictionRequest) -> tuple[pd.DataFrame, dict[str, float | int | str]]:
    employment_type = normalize_employment_type(payload.employment_type)
    city_tier = parse_city_tier(payload.city_tier)
    income = float(payload.monthly_income)
    existing_emi = float(payload.existing_emi)
    years_employed = float(payload.years_employed)
    emi_to_income = existing_emi / income if income > 0 else 1.0

    row = {
        "monthly_income": income,
        "age": int(payload.age),
        "employment_score": EMPLOYMENT_SCORE.get(employment_type, 0.25),
        "existing_emi": existing_emi,
        "years_employed": years_employed,
        "student_flag": 1.0 if payload.is_student else 0.0,
        "city_tier_score": CITY_TIER_SCORE.get(city_tier, 0.82),
        "emi_to_income": emi_to_income,
    }

    return pd.DataFrame([row], columns=FEATURE_COLUMNS), {
        "employment_type": employment_type,
        "city_tier": city_tier,
        "emi_to_income": emi_to_income,
    }


def apply_risk_floor(risk_percent: float, emi_to_income: float) -> tuple[float, str]:
    reason = "No floor applied"
    if emi_to_income > 0.8:
        risk_percent = max(risk_percent, 88.0)
        reason = "EMI to income above 0.80"
    elif emi_to_income > 0.6:
        risk_percent = max(risk_percent, 82.0)
        reason = "EMI to income above 0.60"
    elif emi_to_income > 0.45:
        risk_percent = max(risk_percent, 74.0)
        reason = "EMI to income above 0.45"
    elif emi_to_income > 0.30:
        risk_percent = max(risk_percent, 62.0)
        reason = "EMI to income above 0.30"
    elif emi_to_income > 0.20:
        risk_percent = max(risk_percent, 50.0)
        reason = "EMI to income above 0.20"
    return risk_percent, reason


def compute_credit_score(risk_percent: float, income: float, years_employed: float, employment_type: str) -> int:
    score = 900 - (risk_percent * 4.3)
    score += min(35.0, max(0.0, income / 10000.0))
    score += min(20.0, years_employed * 3.0)

    if employment_type == "government":
        score += 20
    elif employment_type == "private":
        score += 12
    elif employment_type == "self-employed":
        score += 0
    elif employment_type == "student":
        score -= 25
    else:
        score -= 50

    return int(clamp(round(score), 300, 900))


def assign_credit_limit(income: float, risk_percent: float, credit_score: int, emi_to_income: float) -> int:
    if income <= 0:
        return 0
    if risk_percent >= 75 or credit_score < 600:
        return 0
    # Compute a base proportional to income and apply softer penalties
    base_limit = income * 0.18  # starting point: 18% of income
    risk_factor = clamp(1.0 - (risk_percent / 200.0), 0.5, 1.0)  # stronger penalty for high risk
    score_factor = clamp((credit_score - 300) / 600.0, 0.5, 1.0)
    affordability_factor = clamp(1.0 - emi_to_income * 0.5, 0.4, 1.0)
    limit = base_limit * risk_factor * score_factor * affordability_factor

    # Apply tiered caps relative to income
    if risk_percent >= 60:
        limit = min(limit, income * 0.12)
    elif risk_percent >= 45:
        limit = min(limit, income * 0.16)
    elif risk_percent >= 30:
        limit = min(limit, income * 0.20)
    else:
        limit = min(limit, income * 0.28)

    # Allow variable minimum relative to income (so low-income users don't all get same floor)
    min_limit = max(1000.0, income * 0.05)  # 5% of income or 1k minimum
    max_limit = min(income * 0.25, 50000.0)
    limit = clamp(limit, min_limit, max_limit)

    # Round to nearest 500 for nicer numbers
    return int(round(limit / 500.0) * 500)


def build_reasons(risk_percent: float, credit_score: int, employment_type: str, years_employed: float, emi_to_income: float, threshold_breach: bool) -> list[str]:
    reasons: list[str] = []
    if emi_to_income > 0.45:
        reasons.append("EMI to income ratio is high")
    if years_employed < 1.0:
        reasons.append("Employment history is short")
    if employment_type == "student":
        reasons.append("Student profile needs tighter BNPL limits")
    if employment_type == "unemployed":
        reasons.append("Unemployed profiles are high risk")
    if credit_score < 650:
        reasons.append("Credit score is below the preferred threshold")
    if risk_percent >= 60:
        reasons.append("Model risk is elevated")
    if threshold_breach:
        reasons.append("Risk threshold was exceeded")
    if not reasons:
        reasons.append("Profile is within the approved risk band")
    return reasons


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "bnpl-ml-prediction"}


@app.post("/predict")
def predict(payload: PredictionRequest) -> dict:
    features, meta = build_features(payload)
    # Determine index of the 'risky' class (label == 1) so probability reflects risk
    try:
        clf = MODEL.named_steps["classifier"]
        classes = list(getattr(clf, "classes_", []))
        if 1 in classes:
            risk_idx = classes.index(1)
        else:
            # Fallback: if class labels are 0/1 but ordering different, assume second column is risky
            risk_idx = 1 if len(classes) > 1 else 0
    except Exception:
        risk_idx = 1

    probability = float(MODEL.predict_proba(features)[0, risk_idx])
    risk_percent = round(probability * 100.0, 2)
    risk_percent, floor_reason = apply_risk_floor(risk_percent, float(meta["emi_to_income"]))

    income = float(payload.monthly_income)
    years_employed = float(payload.years_employed)
    employment_type = str(meta["employment_type"])
    emi_to_income = float(meta["emi_to_income"])

    credit_score = compute_credit_score(risk_percent, income, years_employed, employment_type)
    threshold_breach = risk_percent >= float(payload.risk_threshold)

    if threshold_breach:
        approval_outcome = "Rejected"
        eligibility_status = "rejected"
        approval_status = "not_eligible"
        assigned_credit_limit = 0
    elif risk_percent >= max(25.0, float(payload.risk_threshold) - 10.0):
        approval_outcome = "Manual Review"
        eligibility_status = "manual_review"
        approval_status = "not_eligible"
        assigned_credit_limit = assign_credit_limit(income, risk_percent, credit_score, emi_to_income)
    else:
        approval_outcome = "Approved"
        eligibility_status = "approved"
        approval_status = "approved"
        assigned_credit_limit = assign_credit_limit(income, risk_percent, credit_score, emi_to_income)

    reasons = build_reasons(
        risk_percent=risk_percent,
        credit_score=credit_score,
        employment_type=employment_type,
        years_employed=years_employed,
        emi_to_income=emi_to_income,
        threshold_breach=threshold_breach,
    )
    if floor_reason != "No floor applied":
        reasons.append(floor_reason)

    return {
        "trace_id": str(uuid.uuid4()),
        "approval_status": approval_status,
        "approval_outcome": approval_outcome,
        "eligibility_status": eligibility_status,
        "assigned_credit_limit": float(assigned_credit_limit),
        "model_risk_percent": float(risk_percent),
        "model_credit_score": int(credit_score),
        "risk_threshold": float(payload.risk_threshold),
        "threshold_breach": bool(threshold_breach),
        "reasons": reasons,
        "decision_source": "new_python_ml_service",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8888, reload=False)
