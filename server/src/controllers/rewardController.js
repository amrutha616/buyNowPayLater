const RewardWallet = require("../models/RewardWallet");
const RewardTransaction = require("../models/RewardTransaction");
const User = require("../models/userModel");
const RewardConfig = require("../models/RewardConfig");
const { getOrCreateWallet, getRewardConfig, creditReward } = require("../services/rewardService");

exports.getMyRewards = async (req, res) => {
	try {
		const wallet = await getOrCreateWallet(req.user.id);
		const recentTransactions = await RewardTransaction.find({ user: req.user.id })
			.sort({ createdAt: -1 })
			.limit(20)
			.lean();

		return res.json({
			wallet: {
				totalEarned: Number(wallet.totalEarned || 0),
				totalRedeemed: Number(wallet.totalRedeemed || 0),
				balance: Number(wallet.balance || 0),
				tier: wallet.tier,
				currentMonthEarned: Number(wallet.currentMonthEarned || 0),
				lastRewardAt: wallet.lastRewardAt || null,
			},
			recentTransactions,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load rewards" });
	}
};

exports.getMyRewardHistory = async (req, res) => {
	try {
		const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
		const transactions = await RewardTransaction.find({ user: req.user.id })
			.sort({ createdAt: -1 })
			.limit(limit)
			.lean();

		return res.json({ transactions });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load reward history" });
	}
};

exports.getAdminRewardSummary = async (req, res) => {
	try {
		const [totalWalletAgg, totalEarnedAgg, monthlyAgg, topEarnersAgg] = await Promise.all([
			RewardWallet.aggregate([
				{ $group: { _id: null, totalBalance: { $sum: "$balance" }, walletCount: { $sum: 1 } } },
			]),
			RewardTransaction.aggregate([
				{ $match: { type: "EARNED" } },
				{ $group: { _id: null, totalEarned: { $sum: "$amount" }, count: { $sum: 1 } } },
			]),
			RewardTransaction.aggregate([
				{ $match: { type: "EARNED" } },
				{
					$group: {
						_id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
						totalCashback: { $sum: "$amount" },
						transactions: { $sum: 1 },
					},
				},
				{ $sort: { _id: -1 } },
				{ $limit: 6 },
			]),
			RewardTransaction.aggregate([
				{ $match: { type: "EARNED" } },
				{
					$group: {
						_id: "$user",
						totalEarned: { $sum: "$amount" },
						count: { $sum: 1 },
					},
				},
				{ $sort: { totalEarned: -1 } },
				{ $limit: 5 },
			]),
		]);

		const userIds = topEarnersAgg.map((entry) => entry._id).filter(Boolean);
		const users = await User.find({ _id: { $in: userIds } }).select("name email").lean();
		const userMap = new Map(users.map((user) => [String(user._id), user]));

		const topEarners = topEarnersAgg.map((entry) => ({
			userId: entry._id,
			name: userMap.get(String(entry._id))?.name || "Unknown",
			email: userMap.get(String(entry._id))?.email || "-",
			totalEarned: Number(entry.totalEarned || 0),
			transactions: Number(entry.count || 0),
		}));

		return res.json({
			summary: {
				totalWalletBalance: Number(totalWalletAgg[0]?.totalBalance || 0),
				walletCount: Number(totalWalletAgg[0]?.walletCount || 0),
				totalCashbackIssued: Number(totalEarnedAgg[0]?.totalEarned || 0),
				totalCashbackTransactions: Number(totalEarnedAgg[0]?.count || 0),
			},
			monthly: monthlyAgg
				.map((item) => ({
					month: item._id,
					totalCashback: Number(item.totalCashback || 0),
					transactions: Number(item.transactions || 0),
				}))
				.reverse(),
			topEarners,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load reward summary" });
	}
};

exports.getAdminRewardConfig = async (req, res) => {
	try {
		const config = await getRewardConfig();
		return res.json({ config });
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to load reward config" });
	}
};

exports.updateAdminRewardConfig = async (req, res) => {
	try {
		const payload = {
			baseCashbackRate: Number(req.body?.baseCashbackRate),
			earlyCashbackRate: Number(req.body?.earlyCashbackRate),
			monthlyCashbackCap: Number(req.body?.monthlyCashbackCap),
			perTxnCashbackCap: Number(req.body?.perTxnCashbackCap),
			referralRewardAmount: Number(req.body?.referralRewardAmount),
			campaignRewardDefaultAmount: Number(req.body?.campaignRewardDefaultAmount),
		};

		if (
			payload.baseCashbackRate < 0 || payload.baseCashbackRate > 1 ||
			payload.earlyCashbackRate < 0 || payload.earlyCashbackRate > 1 ||
			payload.monthlyCashbackCap < 0 || payload.perTxnCashbackCap < 0 ||
			payload.referralRewardAmount < 0 || payload.campaignRewardDefaultAmount < 0
		) {
			return res.status(400).json({ message: "Invalid reward config values" });
		}

		if (payload.earlyCashbackRate < payload.baseCashbackRate) {
			return res.status(400).json({ message: "Early cashback rate must be >= base cashback rate" });
		}

		const config = await RewardConfig.findOneAndUpdate(
			{ key: "default" },
			{ ...payload, updatedBy: req.user.id },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		).lean();

		return res.json({
			message: "Reward config updated",
			config,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to update reward config" });
	}
};

exports.grantCampaignReward = async (req, res) => {
	try {
		const userId = String(req.body?.userId || "").trim();
		const amount = Number(req.body?.amount || 0);
		const campaignCode = String(req.body?.campaignCode || "").trim() || "GENERIC";
		const note = String(req.body?.note || "").trim();

		if (!userId) {
			return res.status(400).json({ message: "userId is required" });
		}
		if (!amount || amount <= 0) {
			return res.status(400).json({ message: "amount must be greater than 0" });
		}

		const user = await User.findById(userId).select("_id name email").lean();
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const reward = await creditReward({
			userId,
			amount,
			source: "CAMPAIGN",
			note: note || `Campaign reward (${campaignCode})`,
			metadata: { campaignCode, grantedBy: req.user.id },
		});

		return res.json({
			message: "Campaign reward granted",
			user,
			reward,
		});
	} catch (err) {
		return res.status(500).json({ message: err.message || "Failed to grant campaign reward" });
	}
};
