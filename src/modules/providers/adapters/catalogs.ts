import type { ProviderTemplate } from "@/modules/providers/adapters/sim-core";

// Fictional provider catalogs (invented names, no third-party text reproduced).
// Each catalog covers every trade and every department (Montevideo, Canelones,
// Maldonado) with at least 2 providers, as required by AC3/T6.

export const OBRAFACIL_TEMPLATES: readonly ProviderTemplate[] = [
  { name: "Constructora Rambla Sur", trades: ["albanileria", "reforma_integral"], zones: ["Centro", "Pocitos"] },
  { name: "Pinturas del Cerro", trades: ["pintura"], zones: ["Carrasco"] },
  { name: "Hidraulica Costa Este", trades: ["sanitaria", "electrica"], zones: ["Las Piedras"] },
  { name: "Electricistas Punta Norte", trades: ["electrica"], zones: ["Maldonado"] },
  { name: "Albanileria San Jacinto", trades: ["albanileria"], zones: ["Punta del Este"] },
  { name: "Reformas Pando", trades: ["pintura", "sanitaria"], zones: ["Pando"] },
  { name: "Integral Montevideo", trades: ["reforma_integral"], zones: ["Cerro"] },
  { name: "Obras Ciudad Vieja", trades: ["electrica", "albanileria"], zones: ["Ciudad Vieja"] },
  { name: "Sanitaria de la Costa", trades: ["sanitaria"], zones: ["Ciudad de la Costa"] },
  { name: "Pintores San Carlos", trades: ["pintura", "reforma_integral"], zones: ["San Carlos"] },
  { name: "Albanileria y Sanitaria Pocitos", trades: ["albanileria", "sanitaria"], zones: ["Pocitos", "Centro"] },
  { name: "Electricidad Piriapolis", trades: ["electrica", "pintura"], zones: ["Piriapolis"] },
];

export const REFORMASYA_TEMPLATES: readonly ProviderTemplate[] = [
  { name: "Reformas Ya Carrasco", trades: ["reforma_integral", "albanileria"], zones: ["Carrasco", "Centro"] },
  { name: "Pintorex Ciudad Vieja", trades: ["pintura"], zones: ["Ciudad Vieja"] },
  { name: "Grifo Facil", trades: ["sanitaria"], zones: ["La Paz"] },
  { name: "Voltia Electricistas", trades: ["electrica", "sanitaria"], zones: ["Ciudad de la Costa"] },
  { name: "Muros del Este", trades: ["albanileria"], zones: ["Maldonado"] },
  { name: "Pintura Total Punta", trades: ["pintura", "electrica"], zones: ["Punta del Este"] },
  { name: "Renovar Cerro", trades: ["reforma_integral"], zones: ["Cerro"] },
  { name: "Sanitaria Express", trades: ["sanitaria", "albanileria"], zones: ["Las Piedras"] },
  { name: "Electro Piriapolis", trades: ["electrica"], zones: ["Piriapolis"] },
  { name: "Pintores del Centro", trades: ["pintura"], zones: ["Pocitos"] },
  { name: "Integral San Carlos", trades: ["reforma_integral", "sanitaria"], zones: ["San Carlos"] },
  { name: "Obras Pando Sur", trades: ["albanileria", "pintura"], zones: ["Pando"] },
];

export const CASAPRO_TEMPLATES: readonly ProviderTemplate[] = [
  { name: "CasaPro Centro", trades: ["albanileria", "electrica"], zones: ["Centro"] },
  { name: "Pintura Uruguaya", trades: ["pintura"], zones: ["Cerro"] },
  { name: "Plomeria del Plata", trades: ["sanitaria"], zones: ["Ciudad de la Costa"] },
  { name: "Chispa Electricistas", trades: ["electrica", "pintura"], zones: ["Pando"] },
  { name: "Remodelaciones Maldonado", trades: ["reforma_integral"], zones: ["Maldonado"] },
  { name: "Albanileria Punta Este", trades: ["albanileria"], zones: ["Punta del Este"] },
  { name: "Integral Las Piedras", trades: ["reforma_integral", "albanileria"], zones: ["Las Piedras"] },
  { name: "Sanitaria San Carlos", trades: ["sanitaria", "electrica"], zones: ["San Carlos"] },
  { name: "Pintores Piriapolis", trades: ["pintura"], zones: ["Piriapolis"] },
  { name: "CasaPro Carrasco", trades: ["electrica", "sanitaria"], zones: ["Carrasco"] },
  { name: "Reforma Ciudad Vieja", trades: ["reforma_integral", "pintura"], zones: ["Ciudad Vieja"] },
  { name: "Albanileria y Pintura La Paz", trades: ["albanileria", "pintura"], zones: ["La Paz"] },
];
