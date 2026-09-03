import {
  renderLayout,
  renderPlainText,
  type EmailContent,
  type LayoutOptions,
} from '@siteops/shared';

export interface VerifyEmailProps {
  readonly name: string;
  readonly verificationUrl: string;
  readonly expiresInMinutes: number;
}

export function verifyEmailTemplate(props: VerifyEmailProps): EmailContent {
  const options: LayoutOptions = {
    heading: 'Confirm your email address',
    paragraphs: [
      `Hi ${props.name},`,
      'Confirm this address to finish setting up your SiteOps account and start monitoring websites.',
    ],
    action: { label: 'Confirm email address', url: props.verificationUrl },
    footnote: `This link expires in ${props.expiresInMinutes} minutes. If you did not create a SiteOps account, you can ignore this email.`,
  };

  return {
    subject: 'Confirm your SiteOps email address',
    html: renderLayout(options),
    text: renderPlainText(options),
  };
}
