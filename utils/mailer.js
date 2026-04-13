const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendMail = async (to, subject, html) => {
    // If SMTP not configured, log and skip
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`📧 [MAIL SKIPPED] To: ${to} | Subject: ${subject}`);
        return { skipped: true };
    }

    try {
        const info = await transporter.sendMail({
            from: `"ZaneZion" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html
        });
        console.log(`📧 Email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error('Email send failed:', err.message);
        throw err;
    }
};

module.exports = { sendMail };
