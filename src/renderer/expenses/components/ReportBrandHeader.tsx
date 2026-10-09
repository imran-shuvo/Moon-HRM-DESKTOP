export default function ReportBrandHeader({
  title,
  generatedAt,
}: {
  title: string;
  generatedAt: Date;
}) {
  return (
    <header className="report-brand-header">
      <div className="report-header-main">
        <div className="report-header-identity">
          <div className="report-brand">
            <div className="report-logo" aria-label="Moon company logo">
              m<span>.</span>
            </div>
            <p className="report-company-name">
              Moon Trading Contracting &amp; Cleaning
            </p>
          </div>
          <div className="report-company-details">
            <p>
              <span>CR</span>
              <strong>1009039045</strong>
            </p>
            <p>
              <span>Member ID</span>
              <strong>955215</strong>
            </p>
          </div>
        </div>
        <div className="report-generated">
          <p className="report-document-title">{title}</p>
          <div className="report-generated-datetime">
            <p>
              <span>Date</span>
              <strong>{generatedAt.toLocaleDateString()}</strong>
            </p>
            <p>
              <span>Time</span>
              <strong>
                {generatedAt.toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </strong>
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
