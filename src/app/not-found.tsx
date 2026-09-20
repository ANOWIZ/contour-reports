import Link from "next/link";

export default function NotFound() {
  return (
    <main className="state-page">
      <div className="state-panel">
        <span className="brand-mark">К</span>
        <p className="eyebrow">Страница не найдена</p>
        <h1>Такого отчета нет</h1>
        <p className="subtle">
          Возможно, ссылка устарела или отчет больше недоступен.
        </p>
        <Link className="button state-link" href="/">
          Вернуться в рабочее пространство
        </Link>
      </div>
    </main>
  );
}
