import {
  formatDuration,
  renderLayout,
  renderPlainText,
  type EmailContent,
  type LayoutOptions,
} from '@siteops/shared';

export interface WebsiteRecoveredProps {
  readonly websiteName: string;
  readonly websiteUrl: string;
  readonly resolvedAt: Date;
  readonly durationSeconds: number;
  readonly dashboardUrl: string;
}

export function websiteRecoveredTemplate(props: WebsiteRecoveredProps): EmailContent {
  const options: LayoutOptions = {
    heading: `${props.websiteName} has recovered`,
    paragraphs: [
      `${props.websiteName} (${props.websiteUrl}) is responding normally again as of ${props.resolvedAt.toUTCString()}.`,
      `It was down for ${formatDuration(props.durationSeconds)}.`,
    ],
    action: { label: 'View incident', url: props.dashboardUrl },
  };

  return {
    subject: `🟢 ${props.websiteName} has recovered`,
    html: renderLayout(options),
    text: renderPlainText(options),
  };
}
