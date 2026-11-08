async (page) => {
  const base = "http://127.0.0.1:4173",
    errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(base) && !request.url().startsWith("data:"))
      external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + "/_screens");
  await page.locator("[data-control=review-state]").selectOption("populated");
  const routes = await page.evaluate(
    async () => (await import("/src/routes.mjs")).routes,
  );
  const failures = [],
    reviewed = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of routes) {
      const previous = errors.length;
      await page.goto(base + route.sample);
      const persona =
        route.scope === "owner"
          ? "owner"
          : route.scope === "ops"
            ? "operator"
            : ["buyer", "shared"].includes(route.scope)
              ? "buyer"
              : "visitor";
      await page.locator("[data-control=persona]").selectOption(persona);
      await page.locator("h1").waitFor({ state: "visible", timeout: 3000 });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const result = await page.evaluate(() => ({
        heading: document.querySelector("h1")?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        scaffold: document.body.textContent.includes(
          "This screen is being assembled.",
        ),
        title: document.title,
      }));
      if (
        !result.heading ||
        result.overflow ||
        result.scaffold ||
        errors.length > previous
      )
        failures.push({
          id: route.id,
          width,
          ...result,
          errors: errors.slice(previous),
        });
      reviewed.push(route.id + ":" + width);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/");
  await page.screenshot({
    path: "prototype/artifacts/home-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/spaces/alpine");
  await page.screenshot({
    path: "prototype/artifacts/asset-desktop.png",
    fullPage: true,
  });
  await page.locator("[data-control=persona]").selectOption("owner");
  await page.goto(base + "/host");
  await page.screenshot({
    path: "prototype/artifacts/owner-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/spaces/alpine");
  await page.screenshot({
    path: "prototype/artifacts/asset-mobile.png",
    fullPage: true,
  });
  return {
    destinations: routes.length,
    viewportChecks: reviewed.length,
    failures,
    jsErrors: errors,
    externalRequests: external,
  };
}
