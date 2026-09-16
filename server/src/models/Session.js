import mongoose from 'mongoose';

/** A refresh-token session. Only a SHA-256 hash of the token is stored. */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, maxlength: 300 },
    expiresAt: { type: Date, required: true },
    // Set when the token is rotated; see the grace window in the auth controller.
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
