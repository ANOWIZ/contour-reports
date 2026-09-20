import { statusLabel } from "@/modules/reports/domain";

type VersionEvent = {
  id: string;
  versionNumber: number;
  reportRevision: number;
  completeness: number | null;
  contentHash: string | null;
  submittedAt: Date;
  actorName: string | null;
};

type ReviewEvent = {
  id: string;
  versionNumber: number;
  fromStatus: string;
  toStatus: "DRAFT" | "SUBMITTED" | "RETURNED" | "PUBLISHED";
  comment: string;
  createdAt: Date;
  actorName: string | null;
};

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function ReportHistory({
  versions,
  reviews,
  title = "История согласования",
}: {
  versions: VersionEvent[];
  reviews: ReviewEvent[];
  title?: string;
}) {
  const events = [
    ...versions.map((version) => ({
      id: `version-${version.id}`,
      date: version.submittedAt,
      title: `Версия ${version.versionNumber} отправлена`,
      detail: `${version.completeness ?? "—"}% заполнено · ревизия ${version.reportRevision}`,
      comment: version.contentHash
        ? `Контрольная сумма ${version.contentHash.slice(0, 10)}…`
        : "",
      actorName: version.actorName,
    })),
    ...reviews.map((review) => ({
      id: `review-${review.id}`,
      date: review.createdAt,
      title: `Версия ${review.versionNumber}: ${statusLabel(review.toStatus)}`,
      detail: review.comment,
      comment: "",
      actorName: review.actorName,
    })),
  ].sort((left, right) => right.date.getTime() - left.date.getTime());

  return (
    <section className="report-history" aria-label={title}>
      <h3>{title}</h3>
      {events.length ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <span aria-hidden="true" />
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
                {event.comment ? <small>{event.comment}</small> : null}
                <time dateTime={event.date.toISOString()}>
                  {dateTime.format(event.date)}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="subtle">Отчет еще не отправлялся на согласование.</p>
      )}
    </section>
  );
}
