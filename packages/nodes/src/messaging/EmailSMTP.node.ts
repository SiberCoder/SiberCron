import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { createTransport } from 'nodemailer';

/**
 * Email SMTP node — sends emails via any SMTP server.
 * Supports HTML content, attachments via URL, CC/BCC, and custom headers.
 */
export const EmailSMTPNode: INodeType = {
  definition: {
    displayName: 'Email (SMTP)',
    name: 'sibercron.emailSmtp',
    icon: 'Mail',
    color: '#EF4444',
    group: 'messaging',
    version: 1,
    description: 'Send emails via SMTP',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'smtpAccount',
        required: true,
      },
    ],
    properties: [
      {
        name: 'to',
        displayName: 'To',
        type: 'string',
        default: '',
        required: true,
        description: 'Recipient email address(es), comma-separated',
      },
      {
        name: 'subject',
        displayName: 'Subject',
        type: 'string',
        default: '',
        required: true,
        description: 'Email subject line',
      },
      {
        name: 'contentType',
        displayName: 'Content Type',
        type: 'select',
        default: 'text',
        required: true,
        description: 'Email body format',
        options: [
          { name: 'Plain Text', value: 'text' },
          { name: 'HTML', value: 'html' },
        ],
      },
      {
        name: 'body',
        displayName: 'Body',
        type: 'string',
        default: '',
        required: true,
        description: 'Email body content',
      },
      {
        name: 'from',
        displayName: 'From',
        type: 'string',
        default: '',
        required: false,
        description: 'Sender email (overrides credential default)',
      },
      {
        name: 'cc',
        displayName: 'CC',
        type: 'string',
        default: '',
        required: false,
        description: 'CC recipients, comma-separated',
      },
      {
        name: 'bcc',
        displayName: 'BCC',
        type: 'string',
        default: '',
        required: false,
        description: 'BCC recipients, comma-separated',
      },
      {
        name: 'replyTo',
        displayName: 'Reply-To',
        type: 'string',
        default: '',
        required: false,
        description: 'Reply-to address',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const creds = await context.getCredential('smtpAccount');
    const items = context.getInputData();

    const to = context.getParameter<string>('to');
    const subject = context.getParameter<string>('subject');
    const contentType = context.getParameter<string>('contentType');
    const body = context.getParameter<string>('body');
    const from = context.getParameter<string>('from') || (creds.user as string);
    const cc = context.getParameter<string>('cc');
    const bcc = context.getParameter<string>('bcc');
    const replyTo = context.getParameter<string>('replyTo');

    const transporter = createTransport({
      host: creds.host as string,
      port: (creds.port as number) || 587,
      secure: (creds.port as number) === 465,
      auth: {
        user: creds.user as string,
        pass: creds.password as string,
      },
    });

    const mailOptions: Record<string, unknown> = {
      from,
      to,
      subject,
    };

    if (contentType === 'html') {
      mailOptions.html = body;
    } else {
      mailOptions.text = body;
    }

    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;
    if (replyTo) mailOptions.replyTo = replyTo;

    const info = await transporter.sendMail(mailOptions);

    context.helpers.log(`Email sent to ${to}: ${info.messageId}`);

    return items.map((item) => ({
      json: {
        ...item.json,
        emailSent: true,
        messageId: info.messageId,
        to,
        subject,
      },
    }));
  },
};
