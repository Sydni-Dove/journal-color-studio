import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import type { ProjectSummary } from "../../persistence/projectStore";

type Props = {
  projects: ProjectSummary[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDuplicateAsVariant: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ProjectList({ projects, onNew, onOpen, onDuplicate, onDuplicateAsVariant, onDelete }: Props) {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>Product Studio</span>
        </div>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={onNew}>New product</button>
      </header>
      <div className="page-shell">
        <h1>Projects</h1>
        <p className="lede">Internal Dove Expressions production tool — planners, journals, notepads, desk pads, inserts, worksheets and trackers.</p>
        {projects.length === 0 ? (
          <div className="card">
            <h3>No projects yet</h3>
            <p>Start with one of the five milestone test products or build your own.</p>
            <div className="card-actions">
              <button className="btn btn--primary" onClick={onNew}>New product</button>
            </div>
          </div>
        ) : (
          <div className="card-grid">
            {projects.map((p) => (
              <div key={p.id} className="card">
                <h3>{p.name}</h3>
                <p>
                  {PRODUCT_TYPES[p.productType]?.label ?? p.productType} · {p.sizePresetId}
                  {p.variantCount ? ` · ${p.variantCount} variant${p.variantCount === 1 ? "" : "s"}` : ""}
                </p>
                <p>Updated {new Date(p.updatedAt).toLocaleString()}</p>
                <div className="card-actions">
                  <button className="btn btn--primary" onClick={() => onOpen(p.id)}>Open</button>
                  <button className="btn" onClick={() => onDuplicate(p.id)}>Duplicate</button>
                  <button className="btn" onClick={() => onDuplicateAsVariant(p.id)}>Duplicate as variant</button>
                  <button
                    className="btn btn--danger"
                    onClick={() => {
                      if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) onDelete(p.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
