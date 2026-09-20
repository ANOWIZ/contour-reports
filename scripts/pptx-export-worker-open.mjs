#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import PptxGenJS from "pptxgenjs";

const SHAPE = new PptxGenJS().ShapeType;

class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new ExportError("INVALID_ARGUMENT", `Invalid argument near ${key ?? "end"}.`);
    }
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function requiredArg(args, key) {
  if (!args[key]) throw new ExportError("INVALID_ARGUMENT", `Missing --${key}`);
  return path.resolve(args[key]);
}

async function readStdin() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > 5_000_000) {
      throw new ExportError("PAYLOAD_TOO_LARGE", "Export payload exceeds 5 MB.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) throw new ExportError("INVALID_PAYLOAD", "Export payload is empty.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ExportError("INVALID_PAYLOAD", "Export payload is not valid JSON.");
  }
}

function assertPayload(payload) {
  if (!payload?.report?.content || !payload?.report?.derived) {
    throw new ExportError(
      "INVALID_PAYLOAD",
      "Payload must contain report.content and report.derived.",
    );
  }
}

const COLORS = {
  orange: "F59D0E",
  orangeDark: "E95B26",
  ink: "171717",
  muted: "6F6F6F",
  gray: "B0B0B0",
  pale: "F6F6F5",
  line: "D8D8D5",
  white: "FFFFFF",
  danger: "C74B45",
  success: "27885F",
};

const FONT = "Montserrat";
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function valueOf(measure) {
  return measure?.state === "VALUE" && Number.isFinite(measure.value)
    ? measure.value
    : null;
}

function numberText(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? numberFormat.format(value)
    : "Нет данных";
}

function percentText(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${numberFormat.format(value)}%`
    : "Нет данных";
}

function measureText(measure, unit = "") {
  if (!measure || measure.state === "MISSING") return "Нет данных";
  if (measure.state === "NOT_APPLICABLE") return "Не применимо";
  return `${numberText(measure.value)}${unit ? ` ${unit}` : ""}`;
}

function textOrState(value, fallback = "Не заполнено") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function collectionStateText(state) {
  if (state === "ZERO") return "0 записей за период";
  if (state === "NOT_APPLICABLE") return "Не применимо";
  return "Нет данных";
}

function vatText(value) {
  return (
    {
      INCLUDED: "с НДС",
      EXCLUDED: "без НДС",
      MIXED: "смешанный НДС",
    }[value] ?? "режим НДС не указан"
  );
}

function chunk(items, size) {
  if (!items.length) return [[]];
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function splitText(value, maxChars) {
  const normalized = textOrState(value).replace(/\r\n/g, "\n");
  if (normalized.length <= maxChars) return [normalized];
  const parts = [];
  let rest = normalized;
  while (rest.length > maxChars) {
    let splitAt = rest.lastIndexOf(" ", maxChars);
    const newlineAt = rest.lastIndexOf("\n", maxChars);
    if (newlineAt > maxChars * 0.45) splitAt = newlineAt;
    if (splitAt < maxChars * 0.45) splitAt = maxChars;
    parts.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function expandColumns(values, limits) {
  const columns = values.map((value, index) =>
    splitText(String(value ?? ""), limits[index] ?? limits.at(-1) ?? 120),
  );
  const count = Math.max(1, ...columns.map((column) => column.length));
  return Array.from({ length: count }, (_, rowIndex) => {
    return columns.map((column) => column[rowIndex] ?? "");
  });
}

function pageTitle(title, index, total) {
  return total > 1 ? `${title} · ${index + 1}/${total}` : title;
}

function makeNotes(report, manifest, section, extraSources = []) {
  const sourceSet = new Set(
    extraSources.filter((value) => typeof value === "string" && value.trim()),
  );
  return [
    "[Sources]",
    `- Report snapshot: ${report.contentHash}; version ${report.version}; mode ${report.exportMode}`,
    `- Reporting period: ${report.periodLabel}; product: ${report.productCode}`,
    `- Template reference: ${manifest.templateVersion}; SHA-256 ${manifest.templateSha256}`,
    `- Section: ${section}`,
    ...[...sourceSet].map((source) => `- Data source: ${source}`),
  ].join("\n");
}

function collectSources(value, result = new Set()) {
  if (!value || typeof value !== "object") return result;
  if (
    "state" in value &&
    "source" in value &&
    typeof value.source === "string" &&
    value.source.trim()
  ) {
    result.add(value.source.trim());
  }
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    collectSources(nested, result);
  }
  return result;
}

function addBrandMark(slide) {
  slide.addShape(SHAPE.chevron, {
    x: 12.62,
    y: 0.3,
    w: 0.28,
    h: 0.16,
    fill: { color: COLORS.orange },
    line: { color: COLORS.orange },
    rotate: 180,
  });
  slide.addShape(SHAPE.chevron, {
    x: 12.62,
    y: 0.48,
    w: 0.28,
    h: 0.16,
    fill: { color: COLORS.orange },
    line: { color: COLORS.orange },
  });
}

function addContentFrame(slide, title, pageNumber) {
  slide.background = { color: "FAFAFA" };
  slide.addShape(SHAPE.roundRect, {
    x: 0.76,
    y: 0.22,
    w: 12.0,
    h: 6.98,
    rectRadius: 0.05,
    fill: { color: "FAFAFA", transparency: 100 },
    line: { color: COLORS.line, width: 1 },
    radius: 0.08,
  });
  slide.addText("УРАЛЬСКИЙ ЦЕНТР СИСТЕМ БЕЗОПАСНОСТИ", {
    x: 0.12,
    y: 1.1,
    w: 0.28,
    h: 3.0,
    rotate: 270,
    fontFace: FONT,
    fontSize: 7,
    color: "A7A7A7",
    margin: 0,
    valign: "mid",
    align: "center",
    breakLine: false,
  });
  slide.addShape(SHAPE.roundRect, {
    x: 0.25,
    y: 4.95,
    w: 0.28,
    h: 0.82,
    rectRadius: 0.04,
    fill: { color: "FAFAFA", transparency: 100 },
    line: { color: "B9B9B9", width: 1 },
  });
  slide.addText("USSC.RU", {
    x: 0.27,
    y: 5.07,
    w: 0.22,
    h: 0.55,
    rotate: 270,
    fontFace: FONT,
    fontSize: 6,
    color: "8B8B8B",
    margin: 0,
    align: "center",
  });
  addBrandMark(slide);
  slide.addText(String(pageNumber), {
    x: 0.35,
    y: 7.05,
    w: 0.3,
    h: 0.12,
    fontFace: FONT,
    fontSize: 7,
    color: "B7B7B7",
    margin: 0,
  });
  slide.addText(title, {
    x: 1.28,
    y: 0.72,
    w: 10.65,
    h: 0.72,
    fontFace: FONT,
    fontSize: title.length > 53 ? 25 : 30,
    color: COLORS.ink,
    bold: false,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
}

function createDeck(report) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Контур — сервис продуктовой отчетности";
  pptx.company = "Уральский центр систем безопасности";
  pptx.subject = `Квартальный отчет ${report.productCode} · ${report.periodLabel}`;
  pptx.title = `${report.productName} · ${report.periodLabel}`;
  pptx.lang = "ru-RU";
  pptx.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
    lang: "ru-RU",
  };
  return pptx;
}

function slideFactory(pptx, report, manifest) {
  let pageNumber = 0;
  const sources = [...collectSources(report.content)];

  return {
    content(title, section) {
      pageNumber += 1;
      const slide = pptx.addSlide();
      addContentFrame(slide, title, pageNumber);
      slide.addNotes(makeNotes(report, manifest, section, sources));
      return slide;
    },
    cover() {
      pageNumber += 1;
      const slide = pptx.addSlide();
      slide.background = { color: COLORS.orange };
      slide.addShape(SHAPE.line, {
        x: 0.42,
        y: 0.28,
        w: 0,
        h: 3.2,
        line: { color: COLORS.white, width: 1 },
      });
      slide.addShape(SHAPE.roundRect, {
        x: 0.78,
        y: 0.22,
        w: 12.0,
        h: 6.98,
        rectRadius: 0.04,
        fill: { color: COLORS.orange, transparency: 100 },
        line: { color: COLORS.white, width: 1 },
      });
      slide.addText("УЦСБ", {
        x: 0.92,
        y: 0.5,
        w: 1.6,
        h: 0.55,
        fontFace: FONT,
        fontSize: 30,
        bold: true,
        color: COLORS.white,
        margin: 0,
      });
      slide.addText(report.productName, {
        x: 1.3,
        y: 2.35,
        w: 7.2,
        h: 0.8,
        fontFace: FONT,
        fontSize: 38,
        color: COLORS.white,
        bold: true,
        margin: 0,
        fit: "shrink",
      });
      slide.addText(`${report.productCode} · ${report.periodLabel}`, {
        x: 1.3,
        y: 3.25,
        w: 6.5,
        h: 0.55,
        fontFace: FONT,
        fontSize: 25,
        color: COLORS.white,
        margin: 0,
      });
      slide.addText(
        [
          `Владелец: ${textOrState(report.content.context.productOwner)}`,
          `Маркетолог: ${textOrState(report.content.context.productMarketer)}`,
          `Контур отчета: ${textOrState(report.content.context.reportScope)}`,
        ].join("\n"),
        {
          x: 8.75,
          y: 2.2,
          w: 3.15,
          h: 2.3,
          fontFace: FONT,
          fontSize: 17,
          color: COLORS.white,
          margin: 0.12,
          breakLine: false,
          valign: "middle",
          fit: "shrink",
        },
      );
      slide.addNotes(makeNotes(report, manifest, "Обложка", sources));
      return slide;
    },
    contact() {
      pageNumber += 1;
      const slide = pptx.addSlide();
      slide.background = { color: COLORS.orange };
      slide.addShape(SHAPE.roundRect, {
        x: 0.78,
        y: 0.22,
        w: 12.0,
        h: 6.98,
        rectRadius: 0.04,
        fill: { color: COLORS.orange, transparency: 100 },
        line: { color: COLORS.white, width: 1 },
      });
      slide.addText("Спасибо\nза внимание!", {
        x: 1.28,
        y: 3.35,
        w: 5.4,
        h: 1.5,
        fontFace: FONT,
        fontSize: 42,
        bold: true,
        color: COLORS.white,
        margin: 0,
      });
      slide.addText(
        [
          report.productCode,
          report.periodLabel,
          "",
          textOrState(report.content.context.productOwner),
          `Владелец продукта ${report.productName}`,
          textOrState(report.content.context.contactEmail),
          textOrState(report.content.context.contactPhone),
        ].join("\n"),
        {
          x: 8.75,
          y: 2.0,
          w: 3.25,
          h: 4.3,
          fontFace: FONT,
          fontSize: 19,
          color: COLORS.white,
          margin: 0.08,
          breakLine: false,
          valign: "mid",
          fit: "shrink",
        },
      );
      slide.addNotes(makeNotes(report, manifest, "Контакты", sources));
      return slide;
    },
  };
}

function addKpi(slide, x, y, w, label, value, accent = false) {
  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h: 1.05,
    rectRadius: 0.05,
    fill: { color: accent ? COLORS.orange : COLORS.pale },
    line: { color: accent ? COLORS.orange : COLORS.line, width: 1 },
  });
  slide.addText(value, {
    x: x + 0.16,
    y: y + 0.15,
    w: w - 0.32,
    h: 0.42,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: accent ? COLORS.white : COLORS.ink,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(label, {
    x: x + 0.16,
    y: y + 0.65,
    w: w - 0.32,
    h: 0.22,
    fontFace: FONT,
    fontSize: 9,
    color: accent ? COLORS.white : COLORS.muted,
    margin: 0,
    fit: "shrink",
  });
}

function addTextBlock(slide, x, y, w, h, label, value, accent = false) {
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.22,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: accent ? COLORS.orangeDark : COLORS.muted,
    margin: 0,
  });
  slide.addText(textOrState(value), {
    x,
    y: y + 0.28,
    w,
    h: h - 0.28,
    fontFace: FONT,
    fontSize: 14,
    color: COLORS.ink,
    margin: 0,
    breakLine: false,
    valign: "top",
    fit: "shrink",
  });
}

function headerCell(text) {
  return {
    text: String(text),
    options: {
      bold: false,
      color: COLORS.ink,
      fill: COLORS.orange,
      valign: "middle",
      margin: 0.08,
    },
  };
}

function bodyCell(text) {
  return {
    text: String(text ?? ""),
    options: {
      color: COLORS.ink,
      fill: "FAFAFA",
      valign: "top",
      margin: 0.08,
    },
  };
}

function addTable(slide, headers, rows, colW, options = {}) {
  const tableRows = [
    headers.map(headerCell),
    ...rows.map((row) => row.map(bodyCell)),
  ];
  slide.addTable(tableRows, {
    x: options.x ?? 1.28,
    y: options.y ?? 1.72,
    w: options.w ?? 11.0,
    colW,
    rowH: options.rowH ?? 0.78,
    fontFace: FONT,
    fontSize: options.fontSize ?? 12,
    color: COLORS.ink,
    border: { type: "solid", color: COLORS.line, pt: 0.8 },
    margin: 0.08,
    breakLine: false,
    valign: "top",
    autoFit: false,
  });
}

function addTablePages(factory, title, section, headers, rows, colW, options = {}) {
  const rowsPerPage = options.rowsPerPage ?? 5;
  const pages = chunk(rows.length ? rows : [[options.emptyText ?? "Нет данных", ...headers.slice(1).map(() => "")]], rowsPerPage);
  pages.forEach((page, index) => {
    const slide = factory.content(pageTitle(title, index, pages.length), section);
    addTable(slide, headers, page, colW, options);
  });
}

function addTextPages(factory, title, section, label, text, maxChars = 720) {
  const pages = splitText(text, maxChars);
  pages.forEach((part, index) => {
    const slide = factory.content(pageTitle(title, index, pages.length), section);
    slide.addText(String(index + 1).padStart(2, "0"), {
      x: 1.3,
      y: 2.2,
      w: 0.8,
      h: 0.5,
      fontFace: FONT,
      fontSize: 30,
      color: COLORS.orange,
      margin: 0,
    });
    slide.addText(label, {
      x: 2.35,
      y: 1.85,
      w: 8.7,
      h: 0.3,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: COLORS.muted,
      margin: 0,
    });
    slide.addText(part, {
      x: 2.35,
      y: 2.25,
      w: 8.8,
      h: 3.7,
      fontFace: FONT,
      fontSize: 20,
      color: COLORS.ink,
      margin: 0,
      breakLine: false,
      valign: "top",
      fit: "shrink",
    });
  });
}

function addBarChart(slide, pptx, labels, series, options = {}) {
  if (!labels.length || !series.length) return false;
  slide.addChart(
    pptx.ChartType.bar,
    series.map((item) => ({
      name: item.name,
      labels,
      values: item.values,
    })),
    {
      x: options.x ?? 1.45,
      y: options.y ?? 1.75,
      w: options.w ?? 6.4,
      h: options.h ?? 3.8,
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 10,
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 9,
      showLegend: series.length > 1,
      legendPos: "b",
      legendFontFace: FONT,
      legendFontSize: 10,
      showTitle: false,
      showCatName: false,
      showSerName: false,
      chartColors: series.map((item) => item.color),
      showValue: true,
      showCategoryName: false,
      showPercent: false,
      valGridLine: { color: "E4E4E4", width: 1 },
      showLabel: true,
      showLeaderLines: false,
      showValAxisTitle: false,
      showCatAxisTitle: false,
      catAxisLineColor: COLORS.line,
      valAxisLineColor: COLORS.line,
    },
  );
  return true;
}

function addExecutiveSummary(pptx, factory, report) {
  const { content, derived } = report;
  const moneyUnit = content.context.moneyUnit;
  const summaryParts = [
    ["Итог квартала", content.summary.quarterResult],
    ["Ключевые проблемы", content.summary.mainProblems],
    ["Главный риск", content.summary.mainRisk],
    ["Требуется внимание", content.summary.requestedAttention],
  ];
  const pages = Math.max(
    1,
    ...summaryParts.map(([, value]) => splitText(value, 360).length),
  );
  for (let index = 0; index < pages; index += 1) {
    const slide = factory.content(
      pageTitle(`Ключевые итоги · ${report.periodLabel}`, index, pages),
      "Ключевые итоги",
    );
    addKpi(
      slide,
      1.28,
      1.65,
      2.5,
      `Выручка факт / план, ${moneyUnit}`,
      `${measureText(content.commercial.revenue.quarterActual)} / ${measureText(content.commercial.revenue.quarterPlan)}`,
      true,
    );
    addKpi(
      slide,
      3.95,
      1.65,
      2.5,
      "Выполнение плана",
      percentText(derived.quarterPlanCompletion),
    );
    addKpi(
      slide,
      6.62,
      1.65,
      2.5,
      "Прогноз года / план",
      `${measureText(content.commercial.revenue.yearForecast)} / ${measureText(content.commercial.revenue.annualPlan)}`,
    );
    addKpi(
      slide,
      9.29,
      1.65,
      2.5,
      "LEADS → сделка",
      percentText(derived.funnelConversions.leadToWon),
    );
    summaryParts.forEach(([label, value], blockIndex) => {
      const fragments = splitText(value, 360);
      const x = blockIndex % 2 === 0 ? 1.3 : 6.72;
      const y = blockIndex < 2 ? 3.0 : 5.0;
      addTextBlock(
        slide,
        x,
        y,
        5.05,
        1.55,
        label,
        fragments[index] ?? "Продолжение на соседнем слайде",
        blockIndex === 2,
      );
    });
  }
}

function addRevenueSlides(pptx, factory, report) {
  const { content, derived } = report;
  const revenue = content.commercial.revenue;
  const moneyUnit = content.context.moneyUnit;
  const values = [
    valueOf(revenue.quarterPlan),
    valueOf(revenue.quarterActual),
    valueOf(revenue.priorYearQuarterActual),
  ];
  const slide = factory.content(
    `Выручка план/факт · ${report.periodLabel}`,
    "Выручка",
  );
  if (values.every((value) => value !== null)) {
    addBarChart(
      slide,
      pptx,
      ["План", "Факт", "Факт прошлого года"],
      [{ name: moneyUnit, values, color: COLORS.orange }],
      { x: 1.35, y: 1.8, w: 6.1, h: 3.8 },
    );
  } else {
    addTextBlock(slide, 1.45, 2.3, 5.6, 1.3, "Диаграмма", "Недостаточно данных для сравнения.");
  }
  addKpi(slide, 1.45, 5.8, 1.85, `Отклонение, ${moneyUnit}`, numberText(derived.quarterVarianceAmount));
  addKpi(slide, 3.45, 5.8, 1.75, "Отклонение, %", percentText(derived.quarterVariance));
  addKpi(slide, 5.35, 5.8, 1.75, "Год к году", percentText(derived.yearOverYearChange));
  addTextBlock(slide, 7.8, 1.8, 4.2, 1.25, "Причина отклонения", revenue.varianceReason, true);
  addTextBlock(slide, 7.8, 3.25, 4.2, 1.25, "Корректирующая мера", revenue.correctiveAction);
  addTextBlock(
    slide,
    7.8,
    4.75,
    4.2,
    1.45,
    "Ответственный / срок / статус",
    `${textOrState(revenue.actionOwner)} · ${textOrState(revenue.actionDueDate)} · ${revenue.actionStatus}`,
  );
}

function addForecastSlides(pptx, factory, report) {
  const { content } = report;
  const moneyUnit = content.context.moneyUnit;
  const points = content.commercial.forecastSeries;
  const rows = points.flatMap((point) =>
    expandColumns(
      [
        point.quarter,
        measureText(point.forecast, moneyUnit),
        measureText(point.actual, moneyUnit),
        textOrState(point.factor),
        `${textOrState(point.forecast.source, "не указан")} / ${textOrState(point.actual.source, "не указан")}`,
      ],
      [24, 20, 20, 90, 55],
    ),
  );
  const pages = chunk(
    rows.length
      ? rows
      : [[collectionStateText(content.collectionStates.forecastSeries), "", "", "", ""]],
    5,
  );
  pages.forEach((page, index) => {
    const slide = factory.content(
      pageTitle("Прогноз выручки до конца года", index, pages.length),
      "Прогноз",
    );
    if (index === 0) {
      const chartPoints = points.filter((point) => valueOf(point.forecast) !== null);
      if (chartPoints.length) {
        addBarChart(
          slide,
          pptx,
          chartPoints.map((point) => point.quarter),
          [
            {
              name: `Прогноз, ${moneyUnit}`,
              values: chartPoints.map((point) => valueOf(point.forecast)),
              color: COLORS.orange,
            },
          ],
          { x: 1.35, y: 1.7, w: 4.4, h: 4.5 },
        );
      }
      slide.addText(`Ключевой фактор: ${textOrState(content.commercial.revenue.forecastFactor)}`, {
        x: 1.45,
        y: 6.2,
        w: 4.2,
        h: 0.55,
        fontFace: FONT,
        fontSize: 12,
        color: COLORS.ink,
        margin: 0,
        fit: "shrink",
      });
      slide.addTable(
        [
          ["Квартал", "Прогноз", "Факт", "Фактор", "Источники"].map(headerCell),
          ...page.map((row) => row.map(bodyCell)),
        ],
        {
          x: 5.95,
          y: 1.72,
          w: 6.2,
          colW: [0.78, 0.92, 0.92, 2.2, 1.38],
          rowH: 0.78,
          fontFace: FONT,
          fontSize: 9,
          border: { type: "solid", color: COLORS.line, pt: 0.7 },
          margin: 0.05,
          valign: "top",
        },
      );
    } else {
      addTable(slide, ["Квартал", "Прогноз", "Факт", "Фактор", "Источники"], page, [1.25, 1.4, 1.4, 4.2, 2.75], {
        fontSize: 10,
        rowH: 0.8,
      });
    }
  });
}

function addPresales(pptx, factory, report) {
  const { content, derived } = report;
  const presales = content.commercial.presales;
  const slide = factory.content("Пресейлы и поддержка продаж", "Пресейлы");
  addKpi(slide, 1.3, 1.7, 2.8, "План", measureText(presales.plan));
  addKpi(slide, 4.3, 1.7, 2.8, "Факт", measureText(presales.actual), true);
  addKpi(slide, 7.3, 1.7, 2.8, "Выполнение", percentText(derived.presalesCompletion));
  const points = presales.series.filter((point) => valueOf(point.value) !== null);
  if (points.length) {
    addBarChart(
      slide,
      pptx,
      points.map((point) => point.quarter),
      [{ name: "Пресейлы", values: points.map((point) => valueOf(point.value)), color: COLORS.orange }],
      { x: 1.4, y: 3.0, w: 6.0, h: 3.0 },
    );
  } else {
    addTextBlock(
      slide,
      1.4,
      3.25,
      5.8,
      1.1,
      "Динамика",
      collectionStateText(content.collectionStates.presalesSeries),
    );
  }
  addTextBlock(slide, 7.8, 3.0, 4.0, 2.7, "Комментарий", presales.comment, true);
}

function addCommercialTables(pptx, factory, report) {
  const { content, derived } = report;
  const moneyUnit = content.context.moneyUnit;
  const dealsRows = content.commercial.deals.flatMap((deal) =>
    expandColumns(
      [deal.customer, deal.subject, deal.status, measureText(deal.amountVat, moneyUnit), deal.amountVat.source],
      [28, 48, 32, 18, 28],
    ),
  );
  addTablePages(
    factory,
    "Ключевые сделки (pipeline)",
    "Ключевые сделки",
    ["Заказчик", "Предмет", "Статус", `Сумма, ${moneyUnit}`, "Источник"],
    dealsRows,
    [2.1, 3.3, 2.25, 1.45, 1.9],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.deals), fontSize: 10 },
  );

  const funnelRows = content.commercial.funnelStages.length
    ? content.commercial.funnelStages.map((stage) => [
        stage.label,
        measureText(stage.active),
        measureText(stage.nextStage),
        measureText(stage.cancelled),
        stage.active.source || stage.nextStage.source || stage.cancelled.source,
      ])
    : [
        ["LEADS", measureText(content.commercial.funnel.leads), "", "", content.commercial.funnel.leads.source],
        ["SQL", measureText(content.commercial.funnel.qualified), "", "", content.commercial.funnel.qualified.source],
        ["SQL с задачами", measureText(content.commercial.funnel.proposals), "", "", content.commercial.funnel.proposals.source],
        ["Сделка", measureText(content.commercial.funnel.won), "", "", content.commercial.funnel.won.source],
      ];
  const slide = factory.content("Воронка продаж и конверсии", "Воронка продаж");
  addTable(
    slide,
    ["Этап", "Активные", "Следующий этап", "Аннулированы", "Источник"],
    funnelRows,
    [2.1, 1.4, 1.7, 1.55, 4.25],
    { y: 1.65, rowH: 0.62, fontSize: 10 },
  );
  const conversions = [
    ["LEADS → SQL", derived.funnelConversions.leadToSql, content.commercial.funnelObservations.leadToSql],
    ["SQL → SQL с задачами", derived.funnelConversions.sqlToTasked, content.commercial.funnelObservations.sqlToTasked],
    ["SQL с задачами → сделка", derived.funnelConversions.taskedToWon, content.commercial.funnelObservations.taskedToWon],
    ["LEADS → сделка", derived.funnelConversions.leadToWon, content.commercial.funnelObservations.leadToWon],
    ["SQL → сделка", derived.funnelConversions.sqlToWon, content.commercial.funnelObservations.sqlToWon],
  ];
  slide.addText(
    conversions
      .map(([label, value, observation], index) => `${String(index + 1).padStart(2, "0")}  ${label}: ${percentText(value)} · ${textOrState(observation)}`)
      .join("\n"),
    {
      x: 1.35,
      y: 5.15,
      w: 10.7,
      h: 1.55,
      fontFace: FONT,
      fontSize: 10,
      color: COLORS.ink,
      breakLine: false,
      margin: 0,
      fit: "shrink",
    },
  );

  const lostRows = content.commercial.lostDeals.flatMap((deal) =>
    expandColumns(
      [deal.customer, measureText(deal.amount, moneyUnit), deal.reason, deal.systemicProblem, deal.amount.source],
      [30, 18, 50, 85, 30],
    ),
  );
  addTablePages(
    factory,
    "Анализ аннулированных сделок",
    "Аннулированные сделки",
    ["Заказчик", "Потери", "Причина", "Системная проблема", "Источник"],
    lostRows,
    [1.9, 1.3, 2.5, 3.8, 1.5],
    {
      rowsPerPage: 5,
      emptyText: collectionStateText(content.collectionStates.lostDeals),
      fontSize: 9,
    },
  );
  if (derived.lostReasons.length) {
    const reasonSlide = factory.content("Причины потерь и недополученная выручка", "Аннулированные сделки");
    addKpi(reasonSlide, 1.35, 1.7, 2.5, "Аннулировано", `${content.commercial.lostDeals.length} сделок`);
    addKpi(reasonSlide, 4.05, 1.7, 2.7, "Недополученная выручка", `${numberText(derived.lostRevenue)} ${moneyUnit}`, true);
    addBarChart(
      reasonSlide,
      pptx,
      derived.lostReasons.map((item) => item.reason),
      [{ name: "Количество", values: derived.lostReasons.map((item) => item.count), color: COLORS.orange }],
      { x: 1.4, y: 3.1, w: 9.8, h: 3.0 },
    );
  }
}

function addMarketing(pptx, factory, report) {
  const { content, derived } = report;
  const mqlSlide = factory.content("Выполнение целей по MQL", "Маркетинг");
  const funnelMeasures = [
    ["MQL", content.marketing.mqlActual],
    ["SQL", content.marketing.sqlActual],
    ["SQL с задачами", content.marketing.sqlWithTasksActual],
    ["Сделки", content.marketing.dealsActual],
  ];
  const available = funnelMeasures.filter(([, measure]) => valueOf(measure) !== null);
  if (available.length) {
    addBarChart(
      mqlSlide,
      pptx,
      available.map(([label]) => label),
      [{ name: "Факт", values: available.map(([, measure]) => valueOf(measure)), color: COLORS.orange }],
      { x: 1.35, y: 1.75, w: 5.8, h: 3.8 },
    );
  }
  addTable(
    mqlSlide,
    ["Показатель", "План", "Факт", "% выполнения / конверсия"],
    [
      ["MQL", measureText(content.marketing.mqlPlan), measureText(content.marketing.mqlActual), percentText(
        valueOf(content.marketing.mqlPlan) && valueOf(content.marketing.mqlActual) !== null
          ? (valueOf(content.marketing.mqlActual) / valueOf(content.marketing.mqlPlan)) * 100
          : null,
      )],
      ["MQL → SQL", "—", "—", percentText(derived.mqlToSql)],
      ["MQL → SQL с задачами", measureText(content.marketing.mqlToSqlWithTasksPlan, "%"), "—", percentText(derived.mqlToSqlWithTasks)],
      ["SQL → SQL с задачами", "—", "—", percentText(derived.sqlToSqlWithTasks)],
      ["SQL с задачами → сделка", "—", "—", percentText(derived.sqlTasksToDeal)],
      ["MQL → сделка", "—", "—", percentText(derived.mqlToDeal)],
    ],
    [1.45, 0.8, 0.8, 1.7],
    { x: 7.25, y: 1.75, w: 4.75, rowH: 0.55, fontSize: 8 },
  );
  addTextBlock(mqlSlide, 8.2, 5.55, 3.6, 0.9, "Источники", available.map(([, measure]) => measure.source).filter(Boolean).join(", "));

  addTextPages(
    factory,
    "Меры по улучшению маркетинговой конверсии",
    "Маркетинг",
    "Меры",
    content.marketing.conversionActions,
    760,
  );

  const goalRows = content.marketing.goals.flatMap((goal, index) =>
    expandColumns(
      [String(index + 1), `${goal.title}\nЦель: ${goal.target}`, `${goal.result}\nСтатус: ${goal.status}; прогресс ${goal.progress}%`],
      [6, 85, 95],
    ),
  );
  addTablePages(
    factory,
    "Выполнение маркетинговых целей",
    "Маркетинг",
    ["№", "Цель", `Результат за ${report.periodLabel}`],
    goalRows,
    [0.5, 5.1, 5.4],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.marketingGoals), fontSize: 10 },
  );

  const activityRows = content.marketing.activities.flatMap((item) =>
    expandColumns(
      [item.title, item.status, `${item.result}\nОтветственный: ${item.owner}`],
      [65, 28, 100],
    ),
  );
  addTablePages(
    factory,
    "Выполнение плана маркетинговых активностей",
    "Маркетинг",
    ["Маркетинговая активность", "Статус", "Результат"],
    activityRows,
    [4.0, 2.0, 5.0],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.marketingActivities), fontSize: 10 },
  );
}

function addProduct(factory, report) {
  const { content } = report;
  const sections = [
    {
      title: "Запущенные и пилотируемые услуги/функции",
      section: "Продукт",
      headers: ["Услуга", "Статус", "Запуск план/факт"],
      colW: [5.2, 2.2, 3.6],
      rows: content.product.launches.flatMap((item) =>
        expandColumns(
          [`${item.title}\nРезультат: ${item.result}`, item.status, `${item.plannedDate} / ${item.actualDate}`],
          [100, 30, 50],
        ),
      ),
      state: content.collectionStates.launches,
    },
    {
      title: "Статус проверки гипотез",
      section: "Продукт",
      headers: ["Гипотеза", "Статус", "Обоснование"],
      colW: [4.4, 1.8, 4.8],
      rows: content.product.hypotheses.flatMap((item) =>
        expandColumns(
          [item.hypothesis, item.status, `Метод: ${item.method}\nРезультат: ${item.result}`],
          [80, 26, 100],
        ),
      ),
      state: content.collectionStates.hypotheses,
    },
    {
      title: "Выполнение годовых целей (бизнес-план)",
      section: "Продукт",
      headers: ["Цель", "Статус", "Комментарий"],
      colW: [4.4, 2.0, 4.6],
      rows: content.product.annualGoals.flatMap((item) =>
        expandColumns(
          [`${item.title}\nЦель: ${item.target}`, `${item.status}; ${item.progress}%`, item.result],
          [90, 32, 95],
        ),
      ),
      state: content.collectionStates.annualGoals,
    },
  ];
  sections.forEach((entry) =>
    addTablePages(
      factory,
      entry.title,
      entry.section,
      entry.headers,
      entry.rows,
      entry.colW,
      { rowsPerPage: 5, emptyText: collectionStateText(entry.state), fontSize: 10 },
    ),
  );
}

function addOperations(factory, report) {
  const { content, derived } = report;
  const moneyUnit = content.context.moneyUnit;
  const vat = vatText(content.context.vatTreatment);
  const resourceRows = content.operations.resources.flatMap((item) =>
    expandColumns(
      [item.role, measureText(item.capacity), measureText(item.load, "%"), item.issue, `${item.capacity.source}; ${item.load.source}`],
      [32, 18, 18, 85, 45],
    ),
  );
  addTablePages(
    factory,
    "Ресурсы: емкость, загрузка и ограничения",
    "Ресурсы и расходы",
    ["Роль", "Емкость", "Загрузка", "Проблема", "Источники"],
    resourceRows,
    [2.1, 1.3, 1.3, 4.2, 2.1],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.resources), fontSize: 9 },
  );

  const expenseRows = content.operations.expenses.flatMap((item) =>
    expandColumns(
      [item.category, measureText(item.plan, moneyUnit), measureText(item.actual, moneyUnit), item.comment, `${item.plan.source}; ${item.actual.source}`],
      [38, 20, 20, 85, 45],
    ),
  );
  addTablePages(
    factory,
    `Расходы план/факт, ${moneyUnit}, ${vat}`,
    "Ресурсы и расходы",
    ["Категория", "План", "Факт", "Комментарий", "Источники"],
    expenseRows,
    [2.2, 1.2, 1.2, 4.2, 2.2],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.expenses), fontSize: 9 },
  );
  const expenseSlide = factory.content("Расходы: общий итог", "Ресурсы и расходы");
  addKpi(expenseSlide, 1.35, 2.0, 3.0, "План расходов", `${numberText(derived.expensePlan)} ${moneyUnit}`);
  addKpi(expenseSlide, 4.65, 2.0, 3.0, "Факт расходов", `${numberText(derived.expenseActual)} ${moneyUnit}`, true);
  const expenseVariance =
    derived.expensePlan !== null && derived.expenseActual !== null
      ? derived.expenseActual - derived.expensePlan
      : null;
  addKpi(expenseSlide, 7.95, 2.0, 3.0, "Отклонение", `${numberText(expenseVariance)} ${moneyUnit}`);
  addTextBlock(
    expenseSlide,
    1.4,
    3.65,
    9.8,
    1.6,
    "Управленческая интерпретация",
    expenseVariance === null
      ? "Недостаточно данных для расчета отклонения."
      : expenseVariance > 0
        ? "Фактические расходы выше плана; причины раскрыты в таблице категорий."
        : "Фактические расходы не превышают план.",
    expenseVariance > 0,
  );

  const probability = { LOW: "Низкая", MEDIUM: "Средняя", HIGH: "Высокая" };
  const status = { OPEN: "Открыт", WATCH: "Наблюдение", CLOSED: "Закрыт" };
  const riskRows = content.operations.risks.flatMap((item) =>
    expandColumns(
      [`${item.title}\nСтатус: ${status[item.status] ?? item.status}`, probability[item.probability] ?? item.probability, item.impact, item.mitigation, item.owner],
      [60, 22, 60, 75, 30],
    ),
  );
  addTablePages(
    factory,
    "Риски и системные проблемы",
    "Риски",
    ["Риск", "Вероятность", "Влияние", "Как избежать", "Ответственный"],
    riskRows,
    [2.4, 1.35, 2.25, 3.35, 1.65],
    { rowsPerPage: 5, emptyText: collectionStateText(content.collectionStates.risks), fontSize: 9 },
  );
}

function addDecisions(factory, report) {
  const category = {
    ACTIVITIES: "Мероприятия",
    TARGETS: "Показатели",
    RESOURCES: "Ресурсы",
    PRIORITIES: "Приоритеты",
    OTHER: "Другое",
  };
  const rows = report.content.decisions.flatMap((item, index) =>
    expandColumns(
      [
        String(index + 1).padStart(2, "0"),
        category[item.category] ?? item.category,
        item.subject,
        item.currentState,
        item.requestedDecision,
        item.expectedImpact,
      ],
      [6, 28, 55, 70, 70, 70],
    ),
  );
  addTablePages(
    factory,
    "Предложения по корректировке",
    "Решения",
    ["№", "Категория", "Предмет", "Сейчас", "Нужно", "Эффект"],
    rows,
    [0.45, 1.35, 2.0, 2.3, 2.45, 2.45],
    { rowsPerPage: 4, emptyText: collectionStateText(report.content.collectionStates.decisions), fontSize: 8 },
  );
  if (report.managementDecision?.trim()) {
    addTextPages(factory, "Решение руководства", "Решения", "Комментарий", report.managementDecision, 760);
  }
}

function addNextQuarter(factory, report) {
  const rows = report.content.nextQuarter.flatMap((item, index) =>
    expandColumns(
      [String(index + 1), item.goal, item.actions, item.expectedResult, item.owner, item.dueDate],
      [6, 55, 80, 70, 30, 18],
    ),
  );
  addTablePages(
    factory,
    "Планы на следующий квартал",
    "Следующий квартал",
    ["№", "Цель", "Действия", "Ожидаемый результат", "Ответственный", "Срок"],
    rows,
    [0.45, 2.1, 2.85, 2.7, 1.75, 1.15],
    { rowsPerPage: 4, emptyText: collectionStateText(report.content.collectionStates.nextQuarter), fontSize: 8 },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const templatePath = requiredArg(args, "template");
  const manifestPath = requiredArg(args, "manifest");
  const [payload, templateBytes, manifestText] = await Promise.all([
    readStdin(),
    fs.readFile(templatePath),
    fs.readFile(manifestPath, "utf8"),
  ]);
  assertPayload(payload);

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new ExportError("INVALID_MANIFEST", "Template manifest is not valid JSON.");
  }
  const actualHash = sha256(templateBytes);
  if (actualHash.toLowerCase() !== String(manifest.templateSha256).toLowerCase()) {
    throw new ExportError(
      "TEMPLATE_HASH_MISMATCH",
      `Template SHA-256 mismatch: expected ${manifest.templateSha256}, got ${actualHash}.`,
    );
  }

  const report = payload.report;
  const pptx = createDeck(report);
  const factory = slideFactory(pptx, report, manifest);
  factory.cover();
  addExecutiveSummary(pptx, factory, report);
  addRevenueSlides(pptx, factory, report);
  addForecastSlides(pptx, factory, report);
  addPresales(pptx, factory, report);
  addCommercialTables(pptx, factory, report);
  addMarketing(pptx, factory, report);
  addProduct(factory, report);
  addOperations(factory, report);
  addDecisions(factory, report);
  addNextQuarter(factory, report);
  factory.contact();

  const output = await pptx.write({ outputType: "nodebuffer", compression: true });
  process.stdout.write(Buffer.from(output));
}

main().catch((error) => {
  const code = error instanceof ExportError ? error.code : "UNEXPECTED_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.PPTX_EXPORT_DEBUG === "1" && error instanceof Error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
  }
  process.stderr.write(`PPTX_EXPORT_ERROR:${code}:${message}\n`);
  process.exitCode = 1;
});
