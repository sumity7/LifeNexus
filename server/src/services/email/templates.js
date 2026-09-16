const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function passwordResetEmail(name, link) {
  const safeName = escapeHtml(name || 'there');
  return {
    subject: 'Reset your LifeOS password',
    text: `Hi ${name || 'there'},\n\nWe received a request to reset your LifeOS password. This link expires in 1 hour and can only be used once:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email — your password will not change.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #141413;">
        <p>Hi ${safeName},</p>
        <p>We received a request to reset your LifeOS password. This link expires in <strong>1 hour</strong> and can only be used once.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 500;">Reset password</a>
        </p>
        <p style="color: #6d6c67; font-size: 13px;">If the button doesn't work, copy this link into your browser:<br><a href="${link}">${link}</a></p>
        <p style="color: #6d6c67; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password will not change.</p>
      </div>
    `.trim(),
  };
}
