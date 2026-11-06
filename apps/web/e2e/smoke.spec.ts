import { expect, test, type Page } from "@playwright/test";

const PLAN = "1og";
const PERSON = "e2e-test";

/** Fehler im Browser sammeln – jeder davon lässt den Test scheitern */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test.afterEach(async ({ request }) => {
  // Testvarianten wieder entfernen, damit nichts im Repo liegen bleibt
  for (const id of ["kueche-e2e"]) await request.delete(`/api/designs/${PLAN}/${PERSON}/${id}`);
});

test("Grundriss, Einrichten, Speichern, Vergleich und 3D", async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.goto("/");

  // Person wählen (eigener Name, damit echte Varianten nicht berührt werden)
  await page.getByPlaceholder("anderer Name").fill(PERSON);
  await page.getByRole("button", { name: "OK" }).click();

  // 2D-Plan zeigt alle Räume, Flächen stimmen mit dem Plan überein
  await expect(page.locator("polygon.room-poly")).toHaveCount(14);
  await expect(page.locator("tr.apt-row", { hasText: "Wohnung Ost" })).toContainText("101,7 m²");

  // Raum gestalten und einrichten
  await page.locator("tr", { hasText: "Zimmer 19,7" }).click();
  await page.locator("button.style-card", { hasText: "Landhaus" }).click();
  await page.locator(".tabs-small button", { hasText: "Küche" }).click();
  await page.locator(".catalog button", { hasText: "Küchenzeile" }).click();
  await expect(page.locator("g.furniture")).toHaveCount(1);
  await expect(page.locator(".dirty")).toBeVisible();

  // Speichern als neue Variante → Datei über die API lesbar
  page.once("dialog", (d) => d.accept("Küche E2E"));
  await page.getByRole("button", { name: "Speichern als …" }).click();
  await expect(page.locator(".message.ok")).toContainText("Küche E2E");
  await expect(page.locator(".dirty")).toBeHidden();
  const list = await (await request.get(`/api/designs/${PLAN}`)).json();
  const saved = list.find((v: { author: string; id: string }) => v.author === PERSON && v.id === "kueche-e2e");
  expect(saved?.furniture).toHaveLength(1);
  expect(saved?.rooms["r-ost-3"].finishes.style).toBe("landhaus");

  // Nur eine Wohnung zeigen: Treppenhaus und Wohnung West verschwinden
  await page.locator("label", { hasText: "Ansicht" }).locator("select").selectOption("apt:ost");
  await expect(page.locator("polygon.room-poly")).toHaveCount(7);

  // Vergleich: gespeicherte Variante gegen leeren Entwurf
  await page.getByRole("button", { name: "Vergleichen" }).click();
  await page.locator(".compare-bar select").first().selectOption({ label: "Küche E2E" });
  await expect(page.locator(".compare-diff strong")).toContainText("0 Räume");

  // 3D lädt und rendert ohne Fehler, Begehen lässt sich ein- und ausschalten
  await page.locator("header .tabs button", { hasText: "3D" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "🚶 Begehen" }).click();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");

  expect(errors).toEqual([]);
});
