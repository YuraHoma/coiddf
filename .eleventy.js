module.exports = function (eleventyConfig) {
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
