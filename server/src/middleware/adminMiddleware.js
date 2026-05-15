const User = require("../models/userModel");

const configuredAdminEmails = (process.env.ADMIN_EMAILS || "admin@example.com")
	.split(",")
	.map((email) => email.trim().toLowerCase())
	.filter(Boolean);

module.exports = async (req, res, next) => {
	try {
		if (!req.user?.id) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const user = await User.findById(req.user.id).select("email isAdmin");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const userEmail = String(user.email || "").toLowerCase();
		const isAdmin = Boolean(user.isAdmin) || configuredAdminEmails.includes(userEmail);

		if (!isAdmin) {
			return res.status(403).json({ message: "Admin access required" });
		}

		req.admin = {
			id: user._id,
			email: user.email,
		};

		next();
	} catch (err) {
		return res.status(500).json({ message: "Error validating admin access" });
	}
};
