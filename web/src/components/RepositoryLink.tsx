import { useI18n } from "../i18n";

interface RepositoryLinkProps {
  href?: string | null;
}

export function RepositoryLink({ href }: RepositoryLinkProps) {
  const { messages } = useI18n();
  const repositoryUrl = href?.trim() ?? "";
  const icon = <GitHubMark />;

  if (repositoryUrl.length === 0) {
    return (
      <span
        className="repository-link repository-link--pending"
        role="img"
        aria-label={messages.app.repositoryPendingLabel}
        aria-disabled="true"
        title={messages.app.repositoryPendingLabel}
      >
        {icon}
      </span>
    );
  }

  return (
    <a
      className="repository-link"
      href={repositoryUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={messages.app.repositoryLabel}
      title={messages.app.repositoryLabel}
    >
      {icon}
    </a>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.71.4.08.55-.18.55-.39 0-.19-.01-.82-.01-1.49-2.01.44-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.21-3.64-.9-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.4 7.4 0 0 1 8 3.77c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.13-1.87 3.81-3.65 4.02.29.25.54.74.54 1.5 0 1.08-.01 1.95-.01 2.22 0 .22.15.47.55.39A8.15 8.15 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
    </svg>
  );
}
