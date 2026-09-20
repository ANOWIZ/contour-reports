export default function Loading() {
  return (
    <main className="state-page" aria-busy="true" aria-live="polite">
      <div className="state-panel">
        <span className="brand-mark">К</span>
        <p className="eyebrow">Загрузка данных</p>
        <h1>Собираем отчет</h1>
        <p className="subtle">
          Получаем показатели, источники и управленческие комментарии.
        </p>
        <div className="loading-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
}
