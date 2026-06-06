/**
 * True when the URL is a full-screen game surface that should render
 * without the portal shell chrome (sidebar/header). Covers both the
 * in-case simulator (`/portal/simulador/:id`) and the menu world
 * (`/portal/jugar`).
 */
export function isGameRoute(url: string): boolean {
  return /\/portal\/(simulador\/\d+|jugar)/.test(url);
}
