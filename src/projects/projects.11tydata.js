const { autoExcerpt } = require("../../scripts/text.js");

module.exports = {
  layout: "project-article.njk",
  permalink: "/proyekty/{{ page.fileSlug | ukslug }}/",
  eleventyComputed: {
    // Короткий опис у CMS не заповнюють — його беремо з початку тексту
    // проєкту. Він іде і в картку, і в meta description, і в соцмережі.
    excerpt: (data) => autoExcerpt(data.page.rawInput),
    description: (data) => autoExcerpt(data.page.rawInput),
  },
};
