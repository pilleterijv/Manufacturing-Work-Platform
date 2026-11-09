// Replace the wordmark asset with the company-provided, approved logo file.
export default function CompanyBrand() {
  return (
    <div className="company-brand">
      <img src="/company-logo.svg" alt="Pharmavite" width={240} height={84} />
      <small>Manufacturing work platform</small>
    </div>
  );
}
