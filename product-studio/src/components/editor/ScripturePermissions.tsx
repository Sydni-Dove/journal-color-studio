import { useEffect, useRef } from "react";
import type { ProductProject } from "../../types/project";
import { scriptureReview } from "../../scripture/scripture-review.js";

export function ScripturePermissions({ project, update }: {
  project: ProductProject;
  update: (change: (current: ProductProject) => ProductProject) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const initial = useRef(project.scripturePermissions);
  const apply = useRef(update);
  apply.current = update;
  const name = project.name;
  const flagged = /coloring|scripture art|card|bookmark/i.test(`${project.name} ${project.productType}`);
  useEffect(() => {
    const target = mount.current;
    if (!target) return;
    const saved = initial.current;
    const collection = { ...saved?.collection };
    const product = { ...saved?.product };
    const save = () => {
      initial.current = { collection: { ...collection }, product: { ...product } };
      apply.current(current => ({ ...current, scripturePermissions: initial.current }));
    };
    const productPanel = () => scriptureReview(name, product, collection.translation || "NIV", save, flagged);
    const collectionPanel = scriptureReview("Collection defaults for this project", collection, "", () => {
      for (let index = 0; index < 5; index++) product[`check${index}`] = false;
      target.lastElementChild?.replaceWith(productPanel());
      save();
    });
    target.replaceChildren(collectionPanel, productPanel());
    return () => target.replaceChildren();
  }, [name, flagged]);
  return <div ref={mount} className="scripture-permissions" />;
}
