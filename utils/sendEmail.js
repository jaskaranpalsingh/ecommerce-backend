const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, html }) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    await transporter.sendMail({
        from: `"NURFIA" <${process.env.MAIL_FROM}>`,
        to,
        subject,
        html,
    });
};

module.exports = sendEmail;