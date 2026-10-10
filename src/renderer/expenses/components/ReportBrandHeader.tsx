import moonLogo from '../../../../assets/moon-logo.png';

export default function ReportBrandHeader({ title }: { title: string }) {
  return (
    <header className="moon-report-header">
      <img
        alt="Moon Trading Contracting and Cleaning logo"
        className="moon-report-logo"
        src={moonLogo}
      />
      <div className="moon-report-company">
        <h1>MOON TRADING CONTRACTING &amp; CLEANING</h1>
        <p>CR No: 1009039045 | Member ID: 955215</p>
        <p className="moon-report-title">{title}</p>
      </div>
    </header>
  );
}
