"use client";

import { Plus, Send, Trash2 } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { ReportContentView } from "@/components/report-content-view";
import {
  saveFullReport,
  type SaveReportState,
} from "@/modules/reports/actions";
import {
  collectionStateLabel,
  defaultFunnelStages,
  missingMeasure,
  reportCompleteness,
  reportDerived,
  type CollectionState,
  type DecisionCategory,
  type FullReportContent,
  type Measure,
} from "@/modules/reports/content";
import { canLeadEdit, type ReportStatus } from "@/modules/reports/domain";

type Path = Array<string | number>;
type MutableNode = Record<string | number, unknown>;

const sections = [
  ["summary", "Контекст и итоги"],
  ["commercial", "Продажи"],
  ["marketing", "Маркетинг"],
  ["product", "Продукт"],
  ["operations", "Ресурсы и риски"],
  ["decisions", "Решения"],
  ["nextQuarter", "Следующий квартал"],
  ["preview", "Предпросмотр"],
] as const;

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled: boolean;
}) {
  const fieldId = useId();

  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
  disabled: boolean;
}) {
  const fieldId = useId();

  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

function MeasureField({
  label,
  unit,
  measure,
  onChange,
  disabled,
}: {
  label: string;
  unit: string;
  measure: Measure;
  onChange: (value: Measure) => void;
  disabled: boolean;
}) {
  const valueId = useId();
  const stateId = useId();
  const sourceId = useId();

  return (
    <div className="measure-field">
      <div className="field">
        <label htmlFor={valueId}>{label}</label>
        <div className="measure-control">
          <select
            id={stateId}
            value={measure.state}
            onChange={(event) => {
              const state = event.target.value as Measure["state"];
              onChange({
                state,
                value: state === "VALUE" ? measure.value : null,
                source:
                  state === "VALUE"
                    ? measure.source || "Ручной ввод"
                    : measure.source,
              });
            }}
            disabled={disabled}
            aria-label={`Состояние данных: ${label}`}
          >
            <option value="VALUE">Есть данные</option>
            <option value="MISSING">Нет данных</option>
            <option value="NOT_APPLICABLE">Не применимо</option>
          </select>
          <input
            id={valueId}
            type="number"
            min={0}
            max={unit === "%" ? 100 : undefined}
            step="0.01"
            value={measure.value ?? ""}
            onChange={(event) =>
              onChange({
                ...measure,
                value: event.target.value === "" ? null : Number(event.target.value),
              })
            }
            disabled={disabled || measure.state !== "VALUE"}
            aria-label={`${label}, значение`}
          />
          <span>{unit}</span>
        </div>
      </div>
      <div className="field source-field">
        <label htmlFor={sourceId}>Источник</label>
        <input
          id={sourceId}
          value={measure.source}
          onChange={(event) => onChange({ ...measure, source: event.target.value })}
          placeholder="CRM, ERP, ручной ввод"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ListHeader({
  title,
  description,
  onAdd,
  disabled,
  recordsCount,
  emptyState,
  onEmptyStateChange,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  disabled: boolean;
  recordsCount?: number;
  emptyState?: CollectionState;
  onEmptyStateChange?: (state: CollectionState) => void;
}) {
  return (
    <>
      <div className="list-header">
        <div>
          <h3>{title}</h3>
          <p className="subtle">{description}</p>
        </div>
        <button className="button ghost compact" type="button" onClick={onAdd} disabled={disabled}>
          <Plus size={14} /> Добавить
        </button>
      </div>
      {recordsCount === 0 && emptyState && onEmptyStateChange ? (
        <div className="collection-state">
          <div>
            <strong>Записей пока нет</strong>
            <span>{collectionStateLabel(emptyState)}</span>
          </div>
          <label>
            Состояние раздела
            <select
              value={emptyState}
              onChange={(event) =>
                onEmptyStateChange(event.target.value as CollectionState)
              }
              disabled={disabled}
            >
              <option value="MISSING">Еще не заполнено</option>
              <option value="ZERO">За период было 0 событий</option>
              <option value="NOT_APPLICABLE">Не применимо</option>
            </select>
          </label>
        </div>
      ) : null}
    </>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const fieldId = useId();

  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function RemoveButton({
  onClick,
  disabled,
  label = "строку",
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Удалить ${label}`}
    >
      <Trash2 size={15} />
    </button>
  );
}

export function ReportEditor({
  report,
}: {
  report: {
    id: string;
    status: ReportStatus;
    revision: number;
    content: FullReportContent;
  };
}) {
  const initialState: SaveReportState = { ok: false, message: "" };
  const [state, formAction, pending] = useActionState(saveFullReport, initialState);
  const [content, setContent] = useState(report.content);
  const [revision, setRevision] = useState(report.revision);
  const [reportStatus, setReportStatus] = useState(report.status);
  const [lastSaved, setLastSaved] = useState(() =>
    JSON.stringify(report.content),
  );
  const [lastAttempted, setLastAttempted] = useState(lastSaved);
  const contentRef = useRef(content);
  const submittedSnapshotRef = useRef(lastSaved);
  const formRef = useRef<HTMLFormElement>(null);
  const manualSaveButtonRef = useRef<HTMLButtonElement>(null);
  const autoSaveButtonRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] =
    useState<(typeof sections)[number][0]>("summary");
  const statusEditable = canLeadEdit(reportStatus);
  const editable = statusEditable && !state.conflict;
  const completeness = reportCompleteness(content);
  const derived = reportDerived(content);
  const currentSnapshot = JSON.stringify(content);
  const dirty = currentSnapshot !== lastSaved;
  const moneyUnit = content.context.moneyUnit || "млн ₽";
  const vatLabel =
    content.context.vatTreatment === "INCLUDED"
      ? "с НДС"
      : content.context.vatTreatment === "EXCLUDED"
        ? "без НДС"
        : "смешанный НДС";
  const moneyUnitWithVat = `${moneyUnit}, ${vatLabel}`;
  const attemptedCurrent = currentSnapshot === lastAttempted;
  const savedAtLabel = state.savedAt
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(state.savedAt))
    : "";
  const saveMessage = pending
    ? "Сохраняем…"
    : state.conflict
      ? state.message
      : !state.ok && state.message && attemptedCurrent
        ? state.message
        : dirty
          ? "Есть изменения — автосохранение через мгновение"
          : savedAtLabel
            ? `Сохранено в ${savedAtLabel}`
            : "Все изменения сохранены";

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (state.ok) {
      setLastSaved(submittedSnapshotRef.current);
      if (state.revision !== undefined) setRevision(state.revision);
      if (state.status) setReportStatus(state.status);
    }
  }, [state]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnAboutUnsavedChanges);
    return () =>
      window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
  }, [dirty, pending]);

  useEffect(() => {
    if (
      !editable ||
      !dirty ||
      pending ||
      currentSnapshot === lastAttempted
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoSaveButtonRef.current?.click();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [currentSnapshot, dirty, editable, lastAttempted, pending, revision]);

  function setAtPath(path: Path, value: unknown) {
    setContent((previous) => {
      const next = structuredClone(previous);
      let cursor = next as unknown as MutableNode;
      for (const key of path.slice(0, -1)) {
        cursor = cursor[key] as MutableNode;
      }
      cursor[path[path.length - 1]] = value;
      return next;
    });
  }

  function appendAtPath(path: Path, value: unknown) {
    setContent((previous) => {
      const next = structuredClone(previous);
      let cursor = next as unknown as MutableNode;
      for (const key of path.slice(0, -1)) {
        cursor = cursor[key] as MutableNode;
      }
      const key = path[path.length - 1];
      cursor[key] = [...(cursor[key] as unknown[]), value];
      return next;
    });
  }

  function removeAtPath(path: Path, index: number) {
    setContent((previous) => {
      const next = structuredClone(previous);
      let cursor = next as unknown as MutableNode;
      for (const key of path.slice(0, -1)) {
        cursor = cursor[key] as MutableNode;
      }
      const key = path[path.length - 1];
      cursor[key] = (cursor[key] as unknown[]).filter(
        (_, itemIndex) => itemIndex !== index,
      );
      return next;
    });
  }

  return (
    <form
      ref={formRef}
      className="full-report-editor"
      action={formAction}
      onSubmit={() => {
        const snapshot = JSON.stringify(contentRef.current);
        submittedSnapshotRef.current = snapshot;
        setLastAttempted(snapshot);
      }}
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.key === "s" || event.key === "S")
        ) {
          event.preventDefault();
          formRef.current?.requestSubmit(manualSaveButtonRef.current);
        }
      }}
    >
      <input type="hidden" name="reportId" value={report.id} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <button
        ref={autoSaveButtonRef}
        type="submit"
        name="intent"
        value="SAVE"
        hidden
      >
        Автосохранение
      </button>

      <nav className="report-sections" aria-label="Разделы отчета">
        {sections.map(([key, label], index) => {
          const sectionComplete =
            key === "preview"
              ? completeness.percent === 100
              : completeness.sections[key];
          return (
            <button
              className={`${activeSection === key ? "active" : ""} ${
                sectionComplete ? "complete" : ""
              }`}
              type="button"
              onClick={() => setActiveSection(key)}
              key={key}
              aria-current={activeSection === key ? "step" : undefined}
            >
              <span>
                {String(index + 1).padStart(2, "0")}
                <i aria-hidden="true">{sectionComplete ? "●" : "○"}</i>
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <div className="report-section-body">
        {activeSection === "summary" ? (
          <div className="report-form">
            <section className="form-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">01 · КОНТЕКСТ</span>
                  <h2>Реквизиты отчета</h2>
                  <p className="subtle">
                    Владелец, маркетолог и границы данных за период.
                  </p>
                </div>
              </div>
              <div className="field-grid">
                <TextField
                  label="Владелец продукта"
                  value={content.context.productOwner}
                  onChange={(value) => setAtPath(["context", "productOwner"], value)}
                  disabled={!editable}
                />
                <TextField
                  label="Продуктовый маркетолог"
                  value={content.context.productMarketer}
                  onChange={(value) =>
                    setAtPath(["context", "productMarketer"], value)
                  }
                  disabled={!editable}
                />
                <TextField
                  label="Контактная почта"
                  value={content.context.contactEmail}
                  onChange={(value) => setAtPath(["context", "contactEmail"], value)}
                  disabled={!editable}
                />
                <TextField
                  label="Телефон"
                  value={content.context.contactPhone}
                  onChange={(value) => setAtPath(["context", "contactPhone"], value)}
                  disabled={!editable}
                />
              </div>
              <TextField
                label="Что входит в отчет"
                value={content.context.reportScope}
                onChange={(value) => setAtPath(["context", "reportScope"], value)}
                multiline
                disabled={!editable}
              />
            </section>

            <section className="form-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">02 · ИТОГИ</span>
                  <h2>Резюме для руководства</h2>
                </div>
              </div>
              <div className="field-grid">
                <TextField
                  label="Результат квартала"
                  value={content.summary.quarterResult}
                  onChange={(value) =>
                    setAtPath(["summary", "quarterResult"], value)
                  }
                  multiline
                  disabled={!editable}
                />
                <TextField
                  label="Главные проблемы"
                  value={content.summary.mainProblems}
                  onChange={(value) =>
                    setAtPath(["summary", "mainProblems"], value)
                  }
                  multiline
                  disabled={!editable}
                />
                <TextField
                  label="Главный риск"
                  value={content.summary.mainRisk}
                  onChange={(value) => setAtPath(["summary", "mainRisk"], value)}
                  multiline
                  disabled={!editable}
                />
                <TextField
                  label="На что требуется внимание"
                  value={content.summary.requestedAttention}
                  onChange={(value) =>
                    setAtPath(["summary", "requestedAttention"], value)
                  }
                  multiline
                  disabled={!editable}
                />
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "commercial" ? (
          <div className="report-form">
            <section className="form-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">03–04 · ВЫРУЧКА</span>
                  <h2>План, факт и прогноз</h2>
                </div>
                <div className="calculated-value">
                  Выполнение плана
                  <strong>
                    {derived.quarterPlanCompletion === null
                      ? "—"
                      : `${derived.quarterPlanCompletion.toFixed(1)}%`}
                  </strong>
                </div>
              </div>
              <div className="measure-grid">
                <MeasureField
                  label="План года"
                  unit={moneyUnitWithVat}
                  measure={content.commercial.revenue.annualPlan}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "annualPlan"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="План квартала"
                  unit={moneyUnitWithVat}
                  measure={content.commercial.revenue.quarterPlan}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "quarterPlan"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="Факт квартала"
                  unit={moneyUnitWithVat}
                  measure={content.commercial.revenue.quarterActual}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "quarterActual"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="Факт аналогичного квартала"
                  unit={moneyUnitWithVat}
                  measure={content.commercial.revenue.priorYearQuarterActual}
                  onChange={(value) =>
                    setAtPath(
                      ["commercial", "revenue", "priorYearQuarterActual"],
                      value,
                    )
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="Прогноз года"
                  unit={moneyUnitWithVat}
                  measure={content.commercial.revenue.yearForecast}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "yearForecast"], value)
                  }
                  disabled={!editable}
                />
                <TextField
                  label="Денежная единица отчета"
                  value={content.context.moneyUnit}
                  onChange={(value) => setAtPath(["context", "moneyUnit"], value)}
                  placeholder="млн ₽"
                  disabled={!editable}
                />
                <SelectField
                  label="Учет НДС"
                  value={content.context.vatTreatment}
                  options={[
                    ["INCLUDED", "С НДС"],
                    ["EXCLUDED", "Без НДС"],
                    ["MIXED", "Смешанный режим"],
                  ]}
                  onChange={(value) =>
                    setAtPath(["context", "vatTreatment"], value)
                  }
                  disabled={!editable}
                />
              </div>
              <div className="field-grid">
                <TextField
                  label="Причина отклонения"
                  value={content.commercial.revenue.varianceReason}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "varianceReason"], value)
                  }
                  multiline
                  disabled={!editable}
                />
                <TextField
                  label="Корректирующие меры"
                  value={content.commercial.revenue.correctiveAction}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "correctiveAction"], value)
                  }
                  multiline
                  disabled={!editable}
                />
                <TextField
                  label="Ответственный за меры"
                  value={content.commercial.revenue.actionOwner}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "actionOwner"], value)
                  }
                  disabled={!editable}
                />
                <TextField
                  label="Срок выполнения мер"
                  value={content.commercial.revenue.actionDueDate}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "actionDueDate"], value)
                  }
                  placeholder="ДД.ММ.ГГГГ"
                  disabled={!editable}
                />
                <SelectField
                  label="Статус корректирующих мер"
                  value={content.commercial.revenue.actionStatus}
                  options={[
                    ["PLANNED", "Запланировано"],
                    ["IN_PROGRESS", "В работе"],
                    ["DONE", "Выполнено"],
                    ["BLOCKED", "Заблокировано"],
                  ]}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "actionStatus"], value)
                  }
                  disabled={!editable}
                />
                <TextField
                  label="Ключевой фактор прогноза"
                  value={content.commercial.revenue.forecastFactor}
                  onChange={(value) =>
                    setAtPath(["commercial", "revenue", "forecastFactor"], value)
                  }
                  multiline
                  disabled={!editable}
                />
                <MeasureField
                  label="Пресейлы — план"
                  unit="шт."
                  measure={content.commercial.presales.plan}
                  onChange={(value) =>
                    setAtPath(["commercial", "presales", "plan"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="Пресейлы — факт"
                  unit="шт."
                  measure={content.commercial.presales.actual}
                  onChange={(value) =>
                    setAtPath(["commercial", "presales", "actual"], value)
                  }
                  disabled={!editable}
                />
                <TextField
                  label="Комментарий по пресейлам"
                  value={content.commercial.presales.comment}
                  onChange={(value) =>
                    setAtPath(["commercial", "presales", "comment"], value)
                  }
                  multiline
                  disabled={!editable}
                />
              </div>
            </section>

            <section className="form-section">
              <ListHeader
                title="Пресейлы по кварталам"
                description="Динамика количества пресейлов для резюме руководства."
                disabled={!editable}
                recordsCount={content.commercial.presales.series.length}
                emptyState={content.collectionStates.presalesSeries}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "presalesSeries"], value)
                }
                onAdd={() =>
                  appendAtPath(["commercial", "presales", "series"], {
                    quarter: "",
                    value: missingMeasure(),
                  })
                }
              />
              {content.commercial.presales.series.map((point, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Квартал {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["commercial", "presales", "series"], index)
                      }
                      label={`квартал пресейлов ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    <TextField
                      label="Период"
                      value={point.quarter}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "presales", "series", index, "quarter"],
                          value,
                        )
                      }
                      placeholder="Q1 2026"
                      disabled={!editable}
                    />
                    <MeasureField
                      label="Пресейлы"
                      unit="шт."
                      measure={point.value}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "presales", "series", index, "value"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Прогноз выручки по кварталам"
                description="Прогноз, факт и ключевой фактор для каждого периода."
                disabled={!editable}
                recordsCount={content.commercial.forecastSeries.length}
                emptyState={content.collectionStates.forecastSeries}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "forecastSeries"], value)
                }
                onAdd={() =>
                  appendAtPath(["commercial", "forecastSeries"], {
                    quarter: "",
                    forecast: missingMeasure(),
                    actual: missingMeasure(),
                    factor: "",
                  })
                }
              />
              {content.commercial.forecastSeries.map((point, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Период {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["commercial", "forecastSeries"], index)
                      }
                      label={`период прогноза ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Квартал"
                    value={point.quarter}
                    onChange={(value) =>
                      setAtPath(
                        ["commercial", "forecastSeries", index, "quarter"],
                        value,
                      )
                    }
                    disabled={!editable}
                  />
                  <div className="measure-grid">
                    <MeasureField
                      label="Прогноз"
                      unit={moneyUnitWithVat}
                      measure={point.forecast}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "forecastSeries", index, "forecast"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <MeasureField
                      label="Факт"
                      unit={moneyUnitWithVat}
                      measure={point.actual}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "forecastSeries", index, "actual"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Ключевой фактор"
                    value={point.factor}
                    onChange={(value) =>
                      setAtPath(
                        ["commercial", "forecastSeries", index, "factor"],
                        value,
                      )
                    }
                    multiline
                    disabled={!editable}
                  />
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Ключевые сделки"
                description="Заказчик, предмет, статус и сумма с НДС."
                disabled={!editable}
                recordsCount={content.commercial.deals.length}
                emptyState={content.collectionStates.deals}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "deals"], value)
                }
                onAdd={() =>
                  appendAtPath(["commercial", "deals"], {
                    customer: "",
                    subject: "",
                    status: "В работе",
                    amountVat: missingMeasure(),
                  })
                }
              />
              <div className="repeatable-list">
                {content.commercial.deals.map((deal, index) => (
                  <div className="repeatable-row" key={index}>
                    <div className="repeatable-row-head">
                      <strong>Сделка {index + 1}</strong>
                      <RemoveButton
                        onClick={() =>
                          removeAtPath(["commercial", "deals"], index)
                        }
                        label={`сделку ${index + 1}`}
                        disabled={!editable}
                      />
                    </div>
                    <div className="field-grid">
                      <TextField
                        label="Заказчик"
                        value={deal.customer}
                        onChange={(value) =>
                          setAtPath(
                            ["commercial", "deals", index, "customer"],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                      <TextField
                        label="Статус"
                        value={deal.status}
                        onChange={(value) =>
                          setAtPath(
                            ["commercial", "deals", index, "status"],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                    </div>
                    <TextField
                      label="Предмет сделки"
                      value={deal.subject}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "deals", index, "subject"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <MeasureField
                      label="Сумма с НДС"
                      unit={moneyUnitWithVat}
                      measure={deal.amountVat}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "deals", index, "amountVat"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">06 · ВОРОНКА</span>
                  <h2>Продажи и конверсии</h2>
                  <p className="subtle">
                    Для каждого этапа укажите активные, перешедшие дальше и
                    аннулированные записи. Пять конверсий рассчитает система.
                  </p>
                </div>
              </div>
              <ListHeader
                title="Структура «этап × состояние»"
                description="Структура соответствует воронке из шаблона отчета."
                disabled={!editable || content.commercial.funnelStages.length > 0}
                recordsCount={content.commercial.funnelStages.length}
                emptyState={content.collectionStates.funnelStages}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "funnelStages"], value)
                }
                onAdd={() =>
                  setAtPath(["commercial", "funnelStages"], defaultFunnelStages())
                }
              />
              {content.commercial.funnelStages.map((stage, index) => (
                <div className="repeatable-row" key={stage.key}>
                  <div className="repeatable-row-head">
                    <strong>{stage.label}</strong>
                    <span className="derived-note">
                      Итого:{" "}
                      {derived.funnelStageTotals[
                        stage.key === "LEADS"
                          ? "leads"
                          : stage.key === "SQL"
                            ? "sql"
                            : stage.key === "SQL_WITH_TASKS"
                              ? "sqlWithTasks"
                              : "won"
                      ] ?? "нет данных"}
                    </span>
                  </div>
                  <div className="measure-grid funnel-state-grid">
                    {(
                      [
                        ["active", "Активные"],
                        ["nextStage", "Перешли на следующий этап"],
                        ["cancelled", "Аннулированы"],
                      ] as const
                    ).map(([key, label]) => (
                      <MeasureField
                        key={key}
                        label={label}
                        unit="шт."
                        measure={stage[key]}
                        onChange={(value) =>
                          setAtPath(
                            ["commercial", "funnelStages", index, key],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="calculation-strip">
                {(
                  [
                    ["leadToSql", "LEADS → SQL"],
                    ["sqlToTasked", "SQL → SQL с задачами"],
                    ["taskedToWon", "SQL с задачами → сделка"],
                    ["leadToWon", "LEADS → сделка"],
                    ["sqlToWon", "SQL → сделка"],
                  ] as const
                ).map(([key, label]) => {
                  const value = derived.funnelConversions[key];
                  return (
                    <div key={key}>
                      <span>{label}</span>
                      <strong>
                        {value === null ? "—" : `${value.toFixed(1)}%`}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <h3 className="subsection-title">
                Ключевые наблюдения по конверсиям
              </h3>
              <div className="field-grid">
                {(
                  [
                    ["leadToSql", "LEADS → SQL"],
                    ["sqlToTasked", "SQL → SQL с задачами"],
                    ["taskedToWon", "SQL с задачами → сделка"],
                    ["leadToWon", "LEADS → сделка"],
                    ["sqlToWon", "SQL → сделка"],
                  ] as const
                ).map(([key, label]) => (
                  <TextField
                    key={key}
                    label={label}
                    value={content.commercial.funnelObservations[key]}
                    onChange={(value) =>
                      setAtPath(
                        ["commercial", "funnelObservations", key],
                        value,
                      )
                    }
                    multiline
                    placeholder="Норма или отклонение, причина и требуемое действие"
                    disabled={!editable}
                  />
                ))}
              </div>
            </section>

            <section className="form-section">
              <ListHeader
                title="Аннулированные сделки"
                description={`Потерянная выручка: ${
                  derived.lostRevenue === null
                    ? "нет данных"
                    : `${derived.lostRevenue.toFixed(1)} ${moneyUnitWithVat}`
                }`}
                disabled={!editable}
                recordsCount={content.commercial.lostDeals.length}
                emptyState={content.collectionStates.lostDeals}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "lostDeals"], value)
                }
                onAdd={() =>
                  appendAtPath(["commercial", "lostDeals"], {
                    customer: "",
                    amount: missingMeasure(),
                    reason: "",
                    systemicProblem: "",
                  })
                }
              />
              <div className="repeatable-list">
                {content.commercial.lostDeals.map((deal, index) => (
                  <div className="repeatable-row" key={index}>
                    <div className="repeatable-row-head">
                      <strong>Потеря {index + 1}</strong>
                      <RemoveButton
                        onClick={() =>
                          removeAtPath(["commercial", "lostDeals"], index)
                        }
                        label={`потерянную сделку ${index + 1}`}
                        disabled={!editable}
                      />
                    </div>
                    <div className="field-grid">
                      <TextField
                        label="Заказчик"
                        value={deal.customer}
                        onChange={(value) =>
                          setAtPath(
                            ["commercial", "lostDeals", index, "customer"],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                      <TextField
                        label="Причина"
                        value={deal.reason}
                        onChange={(value) =>
                          setAtPath(
                            ["commercial", "lostDeals", index, "reason"],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                    </div>
                    <MeasureField
                      label="Потерянная выручка"
                      unit={moneyUnitWithVat}
                      measure={deal.amount}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "lostDeals", index, "amount"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Системная проблема"
                      value={deal.systemicProblem}
                      onChange={(value) =>
                        setAtPath(
                          ["commercial", "lostDeals", index, "systemicProblem"],
                          value,
                        )
                      }
                      multiline
                      disabled={!editable}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "marketing" ? (
          <div className="report-form">
            <section className="form-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">08–10 · МАРКЕТИНГ</span>
                  <h2>MQL и цели</h2>
                </div>
                <div className="calculated-value">
                  MQL → SQL с задачами
                  <strong>
                    {derived.mqlToSqlWithTasks === null
                      ? "—"
                      : `${derived.mqlToSqlWithTasks.toFixed(1)}%`}
                  </strong>
                </div>
              </div>
              <div className="measure-grid">
                <MeasureField
                  label="MQL план"
                  unit="шт."
                  measure={content.marketing.mqlPlan}
                  onChange={(value) =>
                    setAtPath(["marketing", "mqlPlan"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="MQL факт"
                  unit="шт."
                  measure={content.marketing.mqlActual}
                  onChange={(value) =>
                    setAtPath(["marketing", "mqlActual"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="SQL факт"
                  unit="шт."
                  measure={content.marketing.sqlActual}
                  onChange={(value) =>
                    setAtPath(["marketing", "sqlActual"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="SQL с задачами — факт"
                  unit="шт."
                  measure={content.marketing.sqlWithTasksActual}
                  onChange={(value) =>
                    setAtPath(["marketing", "sqlWithTasksActual"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="Сделки — факт"
                  unit="шт."
                  measure={content.marketing.dealsActual}
                  onChange={(value) =>
                    setAtPath(["marketing", "dealsActual"], value)
                  }
                  disabled={!editable}
                />
                <MeasureField
                  label="План конверсии MQL → SQL с задачами"
                  unit="%"
                  measure={content.marketing.mqlToSqlWithTasksPlan}
                  onChange={(value) =>
                    setAtPath(["marketing", "mqlToSqlWithTasksPlan"], value)
                  }
                  disabled={!editable}
                />
              </div>
              <div className="calculation-strip marketing-calculations">
                {(
                  [
                    ["mqlToSql", "MQL → SQL"],
                    ["mqlToSqlWithTasks", "MQL → SQL с задачами"],
                    ["sqlToSqlWithTasks", "SQL → SQL с задачами"],
                    ["sqlTasksToDeal", "SQL с задачами → сделка"],
                    ["mqlToDeal", "MQL → сделка"],
                  ] as const
                ).map(([key, label]) => {
                  const value = derived[key];
                  return (
                    <div key={key}>
                      <span>{label}</span>
                      <strong>
                        {value === null ? "—" : `${value.toFixed(1)}%`}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <TextField
                label="Задачи по улучшению конверсии"
                value={content.marketing.conversionActions}
                onChange={(value) =>
                  setAtPath(["marketing", "conversionActions"], value)
                }
                multiline
                disabled={!editable}
              />
            </section>

            <section className="form-section">
              <ListHeader
                title="Маркетинговые цели"
                description="Цель, ожидаемый и фактический результат."
                disabled={!editable}
                recordsCount={content.marketing.goals.length}
                emptyState={content.collectionStates.marketingGoals}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "marketingGoals"], value)
                }
                onAdd={() =>
                  appendAtPath(["marketing", "goals"], {
                    title: "",
                    target: "",
                    result: "",
                    progress: 0,
                    status: "В работе",
                  })
                }
              />
              {content.marketing.goals.map((goal, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Цель {index + 1}</strong>
                    <RemoveButton
                      onClick={() => removeAtPath(["marketing", "goals"], index)}
                      label={`маркетинговую цель ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    <TextField
                      label="Цель"
                      value={goal.title}
                      onChange={(value) =>
                        setAtPath(["marketing", "goals", index, "title"], value)
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Целевой результат"
                      value={goal.target}
                      onChange={(value) =>
                        setAtPath(["marketing", "goals", index, "target"], value)
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Фактический результат"
                      value={goal.result}
                      onChange={(value) =>
                        setAtPath(["marketing", "goals", index, "result"], value)
                      }
                      disabled={!editable}
                    />
                    <NumberField
                      label="Прогресс, %"
                      min={0}
                      max={100}
                      value={goal.progress}
                      onChange={(value) =>
                        setAtPath(
                          ["marketing", "goals", index, "progress"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Статус"
                      value={goal.status}
                      onChange={(value) =>
                        setAtPath(["marketing", "goals", index, "status"], value)
                      }
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Маркетинговые активности"
                description="План действий, текущий статус и результат."
                disabled={!editable}
                recordsCount={content.marketing.activities.length}
                emptyState={content.collectionStates.marketingActivities}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "marketingActivities"], value)
                }
                onAdd={() =>
                  appendAtPath(["marketing", "activities"], {
                    title: "",
                    status: "Запланировано",
                    result: "",
                    owner: "",
                  })
                }
              />
              {content.marketing.activities.map((activity, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Активность {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["marketing", "activities"], index)
                      }
                      label={`маркетинговую активность ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    {(
                      [
                        ["title", "Активность"],
                        ["status", "Статус"],
                        ["result", "Результат"],
                        ["owner", "Ответственный"],
                      ] as const
                    ).map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        value={activity[key]}
                        onChange={(value) =>
                          setAtPath(
                            ["marketing", "activities", index, key],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "product" ? (
          <div className="report-form">
            <section className="form-section">
              <ListHeader
                title="Услуги и функции"
                description="План и факт продуктовых запусков."
                disabled={!editable}
                recordsCount={content.product.launches.length}
                emptyState={content.collectionStates.launches}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "launches"], value)
                }
                onAdd={() =>
                  appendAtPath(["product", "launches"], {
                    title: "",
                    status: "В работе",
                    plannedDate: "",
                    actualDate: "",
                    result: "",
                  })
                }
              />
              {content.product.launches.map((launch, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Запуск {index + 1}</strong>
                    <RemoveButton
                      onClick={() => removeAtPath(["product", "launches"], index)}
                      label={`запуск ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    {(
                      [
                        ["title", "Услуга или функция"],
                        ["status", "Статус"],
                        ["plannedDate", "Плановая дата"],
                        ["actualDate", "Фактическая дата"],
                        ["result", "Результат"],
                      ] as const
                    ).map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        value={launch[key]}
                        onChange={(value) =>
                          setAtPath(["product", "launches", index, key], value)
                        }
                        disabled={!editable}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Проверка гипотез"
                description="Формулировка, метод, статус и вывод."
                disabled={!editable}
                recordsCount={content.product.hypotheses.length}
                emptyState={content.collectionStates.hypotheses}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "hypotheses"], value)
                }
                onAdd={() =>
                  appendAtPath(["product", "hypotheses"], {
                    hypothesis: "",
                    method: "",
                    status: "Запланирована",
                    result: "",
                  })
                }
              />
              {content.product.hypotheses.map((hypothesis, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Гипотеза {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["product", "hypotheses"], index)
                      }
                      label={`гипотезу ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    {(
                      [
                        ["hypothesis", "Гипотеза"],
                        ["method", "Метод проверки"],
                        ["status", "Статус"],
                        ["result", "Результат"],
                      ] as const
                    ).map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        value={hypothesis[key]}
                        onChange={(value) =>
                          setAtPath(
                            ["product", "hypotheses", index, key],
                            value,
                          )
                        }
                        multiline={key === "hypothesis" || key === "method"}
                        disabled={!editable}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Годовые цели"
                description="Прогресс бизнес-плана и комментарий."
                disabled={!editable}
                recordsCount={content.product.annualGoals.length}
                emptyState={content.collectionStates.annualGoals}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "annualGoals"], value)
                }
                onAdd={() =>
                  appendAtPath(["product", "annualGoals"], {
                    title: "",
                    target: "",
                    result: "",
                    progress: 0,
                    status: "В работе",
                  })
                }
              />
              {content.product.annualGoals.map((goal, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Цель {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["product", "annualGoals"], index)
                      }
                      label={`годовую цель ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    {(
                      [
                        ["title", "Цель"],
                        ["target", "Целевое значение"],
                        ["result", "Комментарий"],
                        ["status", "Статус"],
                      ] as const
                    ).map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        value={goal[key]}
                        onChange={(value) =>
                          setAtPath(
                            ["product", "annualGoals", index, key],
                            value,
                          )
                        }
                        disabled={!editable}
                      />
                    ))}
                    <NumberField
                      label="Прогресс, %"
                      min={0}
                      max={100}
                      value={goal.progress}
                      onChange={(value) =>
                        setAtPath(
                          ["product", "annualGoals", index, "progress"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "operations" ? (
          <div className="report-form">
            <section className="form-section">
              <ListHeader
                title="Ресурсы и загрузка"
                description="Доступная емкость, загрузка и проблемы."
                disabled={!editable}
                recordsCount={content.operations.resources.length}
                emptyState={content.collectionStates.resources}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "resources"], value)
                }
                onAdd={() =>
                  appendAtPath(["operations", "resources"], {
                    role: "",
                    capacity: missingMeasure(),
                    load: missingMeasure(),
                    issue: "",
                  })
                }
              />
              {content.operations.resources.map((resource, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Роль {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["operations", "resources"], index)
                      }
                      label={`ресурс ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Роль или команда"
                    value={resource.role}
                    onChange={(value) =>
                      setAtPath(
                        ["operations", "resources", index, "role"],
                        value,
                      )
                    }
                    disabled={!editable}
                  />
                  <div className="measure-grid">
                    <MeasureField
                      label="Доступная емкость"
                      unit="FTE"
                      measure={resource.capacity}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "resources", index, "capacity"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <MeasureField
                      label="Загрузка"
                      unit="%"
                      measure={resource.load}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "resources", index, "load"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Проблема или дефицит"
                    value={resource.issue}
                    onChange={(value) =>
                      setAtPath(
                        ["operations", "resources", index, "issue"],
                        value,
                      )
                    }
                    multiline
                    disabled={!editable}
                  />
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Расходы"
                description={`Итого: план ${
                  derived.expensePlan === null
                    ? "нет данных"
                    : derived.expensePlan.toFixed(1)
                }, факт ${
                  derived.expenseActual === null
                    ? "нет данных"
                    : derived.expenseActual.toFixed(1)
                } ${moneyUnit}`}
                disabled={!editable}
                recordsCount={content.operations.expenses.length}
                emptyState={content.collectionStates.expenses}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "expenses"], value)
                }
                onAdd={() =>
                  appendAtPath(["operations", "expenses"], {
                    category: "",
                    plan: missingMeasure(),
                    actual: missingMeasure(),
                    comment: "",
                  })
                }
              />
              {content.operations.expenses.map((expense, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Категория {index + 1}</strong>
                    <RemoveButton
                      onClick={() =>
                        removeAtPath(["operations", "expenses"], index)
                      }
                      label={`категорию расходов ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Категория"
                    value={expense.category}
                    onChange={(value) =>
                      setAtPath(
                        ["operations", "expenses", index, "category"],
                        value,
                      )
                    }
                    disabled={!editable}
                  />
                  <div className="measure-grid">
                    <MeasureField
                      label="План"
                      unit={moneyUnit}
                      measure={expense.plan}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "expenses", index, "plan"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <MeasureField
                      label="Факт"
                      unit={moneyUnit}
                      measure={expense.actual}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "expenses", index, "actual"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Комментарий"
                    value={expense.comment}
                    onChange={(value) =>
                      setAtPath(
                        ["operations", "expenses", index, "comment"],
                        value,
                      )
                    }
                    disabled={!editable}
                  />
                </div>
              ))}
            </section>

            <section className="form-section">
              <ListHeader
                title="Риски"
                description="Вероятность, влияние, меры и владелец."
                disabled={!editable}
                recordsCount={content.operations.risks.length}
                emptyState={content.collectionStates.risks}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "risks"], value)
                }
                onAdd={() =>
                  appendAtPath(["operations", "risks"], {
                    title: "",
                    probability: "MEDIUM",
                    impact: "",
                    mitigation: "",
                    owner: "",
                    status: "OPEN",
                  })
                }
              />
              {content.operations.risks.map((risk, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Риск {index + 1}</strong>
                    <RemoveButton
                      onClick={() => removeAtPath(["operations", "risks"], index)}
                      label={`риск ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <div className="field-grid">
                    <TextField
                      label="Риск"
                      value={risk.title}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "risks", index, "title"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <SelectField
                      label="Вероятность"
                      value={risk.probability}
                      options={[
                        ["LOW", "Низкая"],
                        ["MEDIUM", "Средняя"],
                        ["HIGH", "Высокая"],
                      ]}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "risks", index, "probability"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <SelectField
                      label="Статус риска"
                      value={risk.status}
                      options={[
                        ["OPEN", "Открыт"],
                        ["WATCH", "Наблюдение"],
                        ["CLOSED", "Закрыт"],
                      ]}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "risks", index, "status"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Влияние"
                      value={risk.impact}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "risks", index, "impact"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Ответственный"
                      value={risk.owner}
                      onChange={(value) =>
                        setAtPath(
                          ["operations", "risks", index, "owner"],
                          value,
                        )
                      }
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Меры предотвращения"
                    value={risk.mitigation}
                    onChange={(value) =>
                      setAtPath(
                        ["operations", "risks", index, "mitigation"],
                        value,
                      )
                    }
                    multiline
                    disabled={!editable}
                  />
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "decisions" ? (
          <div className="report-form">
            <section className="form-section">
              <ListHeader
                title="Запросы на управленческие решения"
                description="Что требуется изменить и какой эффект это даст."
                disabled={!editable}
                recordsCount={content.decisions.length}
                emptyState={content.collectionStates.decisions}
                onEmptyStateChange={(value) =>
                  setAtPath(["collectionStates", "decisions"], value)
                }
                onAdd={() =>
                  appendAtPath(["decisions"], {
                    category: "OTHER",
                    subject: "",
                    currentState: "",
                    requestedDecision: "",
                    expectedImpact: "",
                  })
                }
              />
              {content.decisions.map((decision, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Решение {index + 1}</strong>
                    <RemoveButton
                      onClick={() => removeAtPath(["decisions"], index)}
                      label={`решение ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <SelectField<DecisionCategory>
                    label="Тип корректировки"
                    value={decision.category}
                    options={[
                      ["ACTIVITIES", "Мероприятия и сроки"],
                      ["TARGETS", "Целевые показатели"],
                      ["RESOURCES", "Поддержка и ресурсы"],
                      ["PRIORITIES", "Приоритеты следующего квартала"],
                      ["OTHER", "Другое"],
                    ]}
                    onChange={(value) =>
                      setAtPath(["decisions", index, "category"], value)
                    }
                    disabled={!editable}
                  />
                  <TextField
                    label="Предмет решения"
                    value={decision.subject}
                    onChange={(value) =>
                      setAtPath(["decisions", index, "subject"], value)
                    }
                    disabled={!editable}
                  />
                  <div className="field-grid">
                    <TextField
                      label="Текущее состояние"
                      value={decision.currentState}
                      onChange={(value) =>
                        setAtPath(["decisions", index, "currentState"], value)
                      }
                      multiline
                      disabled={!editable}
                    />
                    <TextField
                      label="Запрашиваемое решение"
                      value={decision.requestedDecision}
                      onChange={(value) =>
                        setAtPath(
                          ["decisions", index, "requestedDecision"],
                          value,
                        )
                      }
                      multiline
                      disabled={!editable}
                    />
                    <TextField
                      label="Ожидаемый эффект"
                      value={decision.expectedImpact}
                      onChange={(value) =>
                        setAtPath(
                          ["decisions", index, "expectedImpact"],
                          value,
                        )
                      }
                      multiline
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "nextQuarter" ? (
          <div className="report-form">
            <section className="form-section">
              <ListHeader
                title="План следующего квартала"
                description="Цели, мероприятия, ожидаемые результаты и владельцы."
                disabled={!editable}
                onAdd={() =>
                  appendAtPath(["nextQuarter"], {
                    goal: "",
                    actions: "",
                    expectedResult: "",
                    owner: "",
                    dueDate: "",
                  })
                }
              />
              {content.nextQuarter.map((item, index) => (
                <div className="repeatable-row" key={index}>
                  <div className="repeatable-row-head">
                    <strong>Приоритет {index + 1}</strong>
                    <RemoveButton
                      onClick={() => removeAtPath(["nextQuarter"], index)}
                      label={`приоритет ${index + 1}`}
                      disabled={!editable}
                    />
                  </div>
                  <TextField
                    label="Цель"
                    value={item.goal}
                    onChange={(value) =>
                      setAtPath(["nextQuarter", index, "goal"], value)
                    }
                    disabled={!editable}
                  />
                  <div className="field-grid">
                    <TextField
                      label="Мероприятия"
                      value={item.actions}
                      onChange={(value) =>
                        setAtPath(["nextQuarter", index, "actions"], value)
                      }
                      multiline
                      disabled={!editable}
                    />
                    <TextField
                      label="Ожидаемый результат"
                      value={item.expectedResult}
                      onChange={(value) =>
                        setAtPath(
                          ["nextQuarter", index, "expectedResult"],
                          value,
                        )
                      }
                      multiline
                      disabled={!editable}
                    />
                    <TextField
                      label="Ответственный"
                      value={item.owner}
                      onChange={(value) =>
                        setAtPath(["nextQuarter", index, "owner"], value)
                      }
                      disabled={!editable}
                    />
                    <TextField
                      label="Срок"
                      value={item.dueDate}
                      onChange={(value) =>
                        setAtPath(["nextQuarter", index, "dueDate"], value)
                      }
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "preview" ? (
          <div className="preview-panel">
            <div className="preview-intro">
              <p className="eyebrow">Предпросмотр</p>
              <h2>Так отчет увидит руководство</h2>
              <p className="subtle">
                Проверьте цифры, источники, пояснения и запросы на решения перед
                отправкой.
              </p>
            </div>
            <ReportContentView content={content} />
          </div>
        ) : null}
      </div>

      {statusEditable ? (
        <div className="form-actions">
          <span className="save-state" aria-live="polite">
            {saveMessage} · заполнено {completeness.completed} из{" "}
            {completeness.total} разделов
          </span>
          {state.conflict ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Загрузить актуальную версию
            </button>
          ) : (
            <div className="button-group">
              <button
                ref={manualSaveButtonRef}
                className="button secondary"
                type="submit"
                name="intent"
                value="SAVE"
                disabled={pending || !dirty}
              >
                Сохранить
              </button>
              <button
                className="button"
                type="submit"
                name="intent"
                value="SUBMIT"
                disabled={pending || completeness.percent < 100}
              >
                <Send size={15} /> Отправить на проверку
              </button>
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}
