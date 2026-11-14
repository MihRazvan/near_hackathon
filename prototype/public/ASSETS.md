# Asset credits and licenses

The photographs below illustrate the kinds of physical surfaces that can carry advertising. They do not represent available inventory, verified listings, or campaigns delivered through Everywhere.

## Photography

- **`images/van-dublin.webp`** — “A white van parked on the side of the road,” photographed in Dublin by **Mathias Reding**. [Original photograph](https://unsplash.com/photos/a-white-van-parked-on-the-side-of-the-road-OL84QWu3Ong), [photographer](https://unsplash.com/@matreding). The WebP version is a compressed derivative.
- **`images/van-side.webp`** — “A white van parked in front of a building,” photographed in Tashkent by **Anastasia Kim**. [Original photograph](https://unsplash.com/photos/a-white-van-parked-in-front-of-a-building-DfjPOT_aHL0), [photographer](https://unsplash.com/@doevrthinlove). The WebP version is a compressed derivative.

These photographs were downloaded from Unsplash and are used under the [Unsplash License](https://unsplash.com/license), which permits downloading, copying, modifying, distributing, and commercial use. The license does not permit selling unmodified images or compiling a competing image service. The photographers do not endorse Everywhere.

## AI-edited placement example

`images/van-dublin-ad.webp` is an AI-edited derivative of Mathias Reding’s photograph above, created with OpenAI’s built-in image-generation tool. It illustrates a possible vinyl placement, not an actual installation. The “See the blank canvas” control shows the untouched `van-dublin.webp` source image.

Edit prompt: Preserve the original van, street, camera angle, building, lighting and photographic texture. Apply a signal-yellow vinyl advertising decal inside the recessed cargo panel with dark petrol condensed lettering reading “GOOD THINGS” and “GET AROUND.” plus a diagonal arrow. Follow the panel perspective, curvature and central door seam so the decal looks physically installed. Add no interface graphics or other scene changes.


## Motorcycle pilot artwork

The downloadable Everywhere motorcycle design is original vector artwork using the project’s colors and wordmark. Lettering is outlined from Bricolage Grotesque, credited below. The pink/cobalt folded-poster identity matches the production website. It is a draft composition with no physical print size; the permitted panel must be measured and the printer must approve its fit before production.

## Fonts

The production identity uses self-hosted **Bricolage Grotesque** for display typography and **Hanken Grotesk** for interface text. The browser makes no Google Fonts request.

- `fonts/bricolage-grotesque-latin-variable.woff2` — Bricolage Grotesque Project Authors, copyright 2022. Variable weight, width and optical size; Latin subset. [Original project](https://github.com/ateliertriay/bricolage), [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque), [included SIL Open Font License 1.1](fonts/bricolage-OFL.txt).
- `fonts/hanken-grotesk-latin-variable.woff2` — Hanken Grotesk Project Authors, copyright 2021. Variable weights 400–800; Latin subset. [Original project](https://github.com/marcologous/hanken-grotesk), [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/hankengrotesk), [included SIL Open Font License 1.1](fonts/hanken-OFL.txt).

These WOFF2 subsets were obtained from the official Google Fonts CSS service on 12 November 2026. Both fonts remain under their included licenses.

Earlier prototype font assets, Barlow Condensed (Jeremy Tribby and contributors) and Manrope (Mikhail Sharanda and contributors), retain their included [Barlow license](fonts/barlow-OFL.txt) and [Manrope license](fonts/manrope-OFL.txt). They are not used by the current interface.

## Generated team-test vehicles

The four JPEGs in `images/team-tests/` were generated with OpenAI's built-in image-generation tool on 12 November 2026, then converted to JPEG for listing covers. They depict fictional reference vehicles: a red sport motorcycle, blue hatchback, white van and green cargo bicycle. These images are used in labelled team-run mainnet test campaigns. They do not establish vehicle ownership, location, availability or physical installation. The [prompt manifest](images/team-tests/prompts.json) contains the complete prompt for each image.

## Homepage listing walkthrough

The homepage walkthrough uses `images/setup-van.webp`, a compressed WebP copy of `images/team-tests/van.jpg`, the generated reference described above. Its two illustrative SVG placement contours match that photo. Photo, editable spots and listing preview are client-side presentation states; moving the sample handle changes only this preview. It does not perform a new AI analysis, create a listing, request a wallet signature or send a transaction. Real photo/description analysis and the saved editor remain in the owner setup flow.
