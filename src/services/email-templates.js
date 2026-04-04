export function getPasswordResetEmailTemplate(variables) {
  const { resetLink, userName, expiresIn } = variables;
  const displayName = userName || 'User';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #171717; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background-color: #f9f9f9; padding: 30px 20px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background-color: #171717; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { font-size: 12px; color: #666; margin-top: 20px; text-align: center; }
    .warning { background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin: 15px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hi ${displayName},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <center>
        <a href="${resetLink}" class="button">Reset Password</a>
      </center>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px; border-radius: 4px; font-size: 12px;">
        ${resetLink}
      </p>
      <div class="warning">
        <strong>This link expires in ${expiresIn}.</strong> If you didn't request a password reset, you can safely ignore this email.
      </div>
      <p>For security reasons, we never send passwords via email. If you have any questions, please contact our support team.</p>
    </div>
    <div class="footer">
      <p>&copy; 2026 GrowChat. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Password Reset Request

Hi ${displayName},

We received a request to reset your password. Click the link below to create a new password:

${resetLink}

This link expires in ${expiresIn}. If you didn't request a password reset, you can safely ignore this email.

For security reasons, we never send passwords via email. If you have any questions, please contact our support team.

© 2026 GrowChat. All rights reserved.
  `.trim();

  return { html, text };
}
