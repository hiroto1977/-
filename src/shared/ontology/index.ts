export { ZONES, BUILDS, ENTITY_CLASSES, ZONE_IDS, BUILD_IDS } from './vocabulary';
export type { ZoneId, BuildId, ZoneSpec, BuildSpec, EntityClass } from './vocabulary';
export {
  SIDEBAR_CATEGORIES,
  FACET_AXIOMS,
  facetViolations,
  facetTotals,
} from './serviceFacets';
export type { SidebarCategory, Placement, ServiceFacet, FacetAxiom, FacetViolation } from './serviceFacets';
export { LAWS, LAW_FAMILIES, validateLawLedger } from './laws';
export type { Law, LawFamily, Enforcer, LawLedgerProblem } from './laws';
export { renderOntologyMarkdown, lawsWithoutMachine, isMachine } from './render';
export type { OntologyFacts } from './render';
