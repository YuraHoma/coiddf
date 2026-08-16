const { autoExcerpt } = require("../../scripts/text.js");

module.exports = {
  layout: "news-article.njk",
  permalink: "/novyny/{{ page.fileSlug | ukslug }}/",
  eleventyComputed: {
    // Короткий опис у CMS не заповнюють — його беремо з початку тексту
    // новини. Він іде і в картку, і в meta description, і в соцмережі.
    excerpt: (data) => autoExcerpt(data.page.rawInput),
    description: (data) => autoExcerpt(data.page.rawInput),
  },
};
