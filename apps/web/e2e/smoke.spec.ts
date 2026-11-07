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

test("Maße tippen, bündig duplizieren, nicht überlappen, Wand entfernen, Klavier", async ({ page }) => {
  const errors = trackErrors(page);
  const furniture = () => page.evaluate(() => JSON.parse(localStorage.getItem("wohnplaner:draft:1og")!).plan.furniture);
  await page.goto("/");
  await page.getByPlaceholder("anderer Name").fill(PERSON);
  await page.getByRole("button", { name: "OK" }).click();

  // Nur die Küche (Zimmer 19,7) zeigen
  await page.locator("label", { hasText: "Ansicht" }).locator("select").selectOption("room:r-ost-3");
  await page.locator("tr", { hasText: "Zimmer 19,7" }).click();
  await page.locator(".tabs-small button", { hasText: "Küche" }).click();
  await page.locator(".catalog button", { hasText: "Küchenzeile" }).click();

  // Maß frei eintippen – auch die erste Ziffer lässt sich löschen
  const width = page.locator("label.field", { hasText: "Breite" }).locator("input");
  await width.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Delete");
  expect((await furniture())[0].width).toBeCloseTo(0.4, 6);
  await width.fill("");
  await page.keyboard.type("120");
  await page.keyboard.press("Enter");
  expect((await furniture())[0].width).toBeCloseTo(1.2, 6);

  // Duplizieren legt die Kopie bündig daneben, im selben Raum
  await page.getByRole("button", { name: "Duplizieren" }).click();
  const [a, b] = await furniture();
  expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBeCloseTo(1.2, 6);
  await expect(page.locator("g.furniture")).toHaveCount(2);

  // Kopie auf das Original ziehen → stoppt genau beim Berühren, keine Überschneidung
  const sel = await page.locator("g.furniture.selected").boundingBox();
  const other = await page.locator("g.furniture:not(.selected)").boundingBox();
  await page.mouse.move(sel!.x + sel!.width / 2, sel!.y + sel!.height / 2);
  await page.mouse.down();
  await page.mouse.move(other!.x + other!.width / 2, other!.y + other!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("g.furniture.colliding")).toHaveCount(0);
  await expect(page.locator(".clearance text", { hasText: "bündig" })).toHaveCount(1);

  // Klavier aus dem Katalog
  await page.keyboard.press("Escape");
  await page.locator("tr", { hasText: "Zimmer 19,7" }).click();
  await page.locator(".tabs-small button", { hasText: "Musik" }).click();
  await page.locator(".catalog button", { hasText: /^Klavier$/ }).click();
  expect((await furniture()).some((f: { type: string }) => f.type === "klavier")).toBe(true);

  // Wand zwischen Zimmer 14,7 und 19,7 entfernen (nur in dieser Variante) und wiederherstellen
  await page.locator("label", { hasText: "Ansicht" }).locator("select").selectOption("apt:ost");
  await page.locator(".toolbar button", { hasText: "Wände" }).click();
  await page.locator('polygon[data-wall="iw-2"]').click({ force: true });
  await page.getByRole("button", { name: "Wand entfernen (Entf)" }).click();
  await expect(page.locator('polygon[data-wall="iw-2"]')).toHaveCount(0);
  await page.locator("polygon.wall-removed").first().click({ force: true });
  await page.getByRole("button", { name: "Wand wiederherstellen" }).click();
  await expect(page.locator('polygon[data-wall="iw-2"]')).toHaveCount(1);

  expect(errors).toEqual([]);
});
