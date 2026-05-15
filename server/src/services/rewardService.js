const RewardWallet = require("../models/RewardWallet");
const RewardTransaction = require("../models/RewardTransaction");
const RewardConfig = require("../models/RewardConfig");

const BASE_CASHBACK_RATE = Number(process.env.REWARD_BASE_CASHBACK_RATE || 0.02);
const EARLY_CASHBACK_RATE = Number(process.env.REWARD_EARLY_CASHBACK_RATE || 0.03);
const MONTHLY_CASHBACK_CAP = Number(process.env.REWARD_MONTHLY_CASHBACK_CAP || 500);
const PER_TXN_CASHBACK_CAP = Number(process.env.REWARD_PER_TXN_CASHBACK_CAP || 200);

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getRewardConfig = async () => {
	const existing = await RewardConfig.findOne({ key: "default" }).lean();
	if (existing) {
		return {
			baseCashbackRate: Number(existing.baseCashbackRate || BASE_CASHBACK_RATE),
			earlyCashbackRate: Number(existing.earlyCashbackRate || EARLY_CASHBACK_RATE),
			monthlyCashbackCap: Number(existing.monthlyCashbackCap || MONTHLY_CASHBACK_CAP),
			perTxnCashbackCap: Number(existing.perTxnCashbackCap || PER_TXN_CASHBACK_CAP),
			referralRewardAmount: Number(existing.referralRewardAmount || 500),
			campaignRewardDefaultAmount: Number(existing.campaignRewardDefaultAmount || 250),
		};
	}

	const created = await RewardConfig.create({
		key: "default",
		baseCashbackRate: BASE_CASHBACK_RATE,
		earlyCashbackRate: EARLY_CASHBACK_RATE,
		monthlyCashbackCap: MONTHLY_CASHBACK_CAP,
		perTxnCashbackCap: PER_TXN_CASHBACK_CAP,
	});

	return {
		baseCashbackRate: Number(created.baseCashbackRate),
		earlyCashbackRate: Number(created.earlyCashbackRate),
		monthlyCashbackCap: Number(created.monthlyCashbackCap),
		perTxnCashbackCap: Number(created.perTxnCashbackCap),
		referralRewardAmount: Number(created.referralRewardAmount || 500),
		campaignRewardDefaultAmount: Number(created.campaignRewardDefaultAmount || 250),
	};
};

const resolveTier = (totalEarned) => {
	if (totalEarned >= 5000) return "PLATINUM";
	if (totalEarned >= 2500) return "GOLD";
	if (totalEarned >= 1000) return "SILVER";
	return "BRONZE";
};

const getOrCreateWallet = async (userId) => {
	let wallet = await RewardWallet.findOne({ user: userId });
	if (!wallet) {
		wallet = await RewardWallet.create({
			user: userId,
			currentMonthKey: monthKey(),
		});
	}
	return wallet;
};

const creditReward = async ({ userId, amount, source, note, loanId, metadata }) => {
	const rewardAmount = round2(Number(amount || 0));
	if (rewardAmount <= 0) {
		return { amount: 0, walletBalance: 0, tier: "BRONZE" };
	}

	const wallet = await getOrCreateWallet(userId);
	wallet.totalEarned = round2(Number(wallet.totalEarned || 0) + rewardAmount);
	wallet.balance = round2(Number(wallet.balance || 0) + rewardAmount);
	wallet.tier = resolveTier(wallet.totalEarned);
	wallet.lastRewardAt = new Date();
	if (wallet.currentMonthKey !== monthKey()) {
		wallet.currentMonthKey = monthKey();
		wallet.currentMonthEarned = 0;
	}
	wallet.currentMonthEarned = round2(Number(wallet.currentMonthEarned || 0) + rewardAmount);
	await wallet.save();

	await RewardTransaction.create({
		user: userId,
		loan: loanId || undefined,
		type: "EARNED",
		source,
		amount: rewardAmount,
		note: note || "Reward credited",
		metadata: metadata || undefined,
	});

	return { amount: rewardAmount, walletBalance: wallet.balance, tier: wallet.tier };
};

const redeemReward = async ({ userId, amount, source, note, loanId, metadata }) => {
	const redeemAmount = round2(Number(amount || 0));
	if (redeemAmount <= 0) {
		return { amount: 0, walletBalance: 0 };
	}

	const wallet = await getOrCreateWallet(userId);
	const actualRedeemed = round2(Math.min(redeemAmount, Number(wallet.balance || 0)));
	if (actualRedeemed <= 0) {
		return { amount: 0, walletBalance: wallet.balance };
	}

	wallet.balance = round2(Number(wallet.balance || 0) - actualRedeemed);
	wallet.totalRedeemed = round2(Number(wallet.totalRedeemed || 0) + actualRedeemed);
	await wallet.save();

	await RewardTransaction.create({
		user: userId,
		loan: loanId || undefined,
		type: "REDEEMED",
		source,
		amount: actualRedeemed,
		note: note || "Reward redeemed",
		metadata: metadata || undefined,
	});

	return { amount: actualRedeemed, walletBalance: wallet.balance, tier: wallet.tier };
};

const applyRepaymentCashback = async ({
	userId,
	loanId,
	paymentAmount,
	dueDate,
	installmentNumber,
	note,
}) => {
	const amount = Number(paymentAmount || 0);
	if (amount <= 0) {
		return { cashbackEarned: 0, walletBalance: 0, rateApplied: 0, capped: false };
	}

	const wallet = await getOrCreateWallet(userId);
	const config = await getRewardConfig();
	const now = new Date();
	const activeMonthKey = monthKey(now);
	if (wallet.currentMonthKey !== activeMonthKey) {
		wallet.currentMonthKey = activeMonthKey;
		wallet.currentMonthEarned = 0;
	}

	const due = dueDate ? new Date(dueDate) : null;
	const isEarlyOrOnTime = due && !Number.isNaN(due.getTime()) ? now <= due : false;
	const rateApplied = isEarlyOrOnTime ? config.earlyCashbackRate : config.baseCashbackRate;

	const rawCashback = round2(amount * rateApplied);
	const monthRemaining = Math.max(0, round2(config.monthlyCashbackCap - Number(wallet.currentMonthEarned || 0)));
	const cashbackEarned = round2(Math.max(0, Math.min(rawCashback, config.perTxnCashbackCap, monthRemaining)));

	if (cashbackEarned <= 0) {
		return {
			cashbackEarned: 0,
			walletBalance: round2(wallet.balance),
			rateApplied,
			capped: true,
		};
	}

	wallet.totalEarned = round2(Number(wallet.totalEarned || 0) + cashbackEarned);
	wallet.balance = round2(Number(wallet.balance || 0) + cashbackEarned);
	wallet.currentMonthEarned = round2(Number(wallet.currentMonthEarned || 0) + cashbackEarned);
	wallet.lastRewardAt = now;
	wallet.tier = resolveTier(wallet.totalEarned);
	await wallet.save();

	await RewardTransaction.create({
		user: userId,
		loan: loanId || undefined,
		type: "EARNED",
		source: "REPAYMENT_CASHBACK",
		amount: cashbackEarned,
		rateApplied,
		paymentAmount: amount,
		installmentNumber: installmentNumber || undefined,
		note: note || "Cashback earned on repayment",
		metadata: {
			isEarlyOrOnTime,
			rawCashback,
			monthlyCap: config.monthlyCashbackCap,
			perTxnCap: config.perTxnCashbackCap,
		},
	});

	return {
		cashbackEarned,
		walletBalance: round2(wallet.balance),
		rateApplied,
		capped: cashbackEarned < rawCashback,
		tier: wallet.tier,
	};
};

module.exports = {
	getRewardConfig,
	getOrCreateWallet,
	creditReward,
	redeemReward,
	applyRepaymentCashback,
};
