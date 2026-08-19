import { AppNav } from "./app-nav";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
}) {
  return (
    <>
      <section className="topbar">
        <div>
          <div className="brand">
            <div className="logo">CP</div>
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
            </div>
          </div>
          <p className="subtitle">{subtitle}</p>
        </div>
        {aside}
      </section>
      <AppNav />
    </>
  );
}
