const { eleventyImageTransformPlugin } = require("@11ty/eleventy-img");

module.exports = function (eleventyConfig) {
  // Optimize every <img> in the output HTML: WebP + responsive srcset,
  // width/height attributes (no layout shift). Single format keeps <img>
  // un-wrapped (no <picture>), so existing CSS selectors still match.
  // Attributes set in templates (loading, sizes, fetchpriority) win over
  // the defaults below.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp"],
    widths: [480, 800, 1200, 1600],
    urlPath: "/assets/opt/",
    outputDir: "_site/assets/opt/",
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async", sizes: "auto" },
    },
  });

  // Static passthrough — styles, images, misc files copied as-is.
  eleventyConfig.addPassthroughCopy({ "src/styles.css": "styles.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });

  // Newest news first
  eleventyConfig.addCollection("news", (api) =>
    api.getFilteredByGlob("src/news/*.md").sort((a, b) => new Date(b.data.date) - new Date(a.data.date))
  );
  eleventyConfig.addCollection("projects", (api) =>
    api.getFilteredByGlob("src/projects/*.md").sort((a, b) => new Date(b.data.date) - new Date(a.data.date))
  );

  // Format an ISO date as DD.MM.YYYY for display.
  // UTC methods: front-matter dates are parsed as UTC midnight, local getters
  // would shift the day on build machines west of UTC.
  eleventyConfig.addFilter("uadate", (value) => {
    const d = new Date(value);
    if (isNaN(d)) return value;
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
