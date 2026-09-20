"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="state-page">
      <div className="state-panel">
        <span className="brand-mark">К</span>
        <p className="eyebrow">Не удалось загрузить данные</p>
        <h1>Отчет временно недоступен</h1>
        <p className="subtle">
          Данные не изменены. Повторите запрос; если ошибка сохранится,
          сообщите администратору.
        </p>
        <button className="button" type="button" onClick={reset}>
          Повторить
        </button>
      </div>
    </main>
  );
}
