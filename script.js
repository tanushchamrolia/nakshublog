// ------------------------------------------------------------------
// CONTENT SOURCE — a single published Google Sheet, read-only.
// Paste your Sheet ID below once (see README). Until then this stays
// blank and every page quietly falls back to the text already written
// into the HTML.
// ------------------------------------------------------------------
const SHEET_ID = "1HLti9dIu5B8Z7WJSiq5N1ArrE_LkkxGW_rakZIx3k0I";

function slugify(text) {
    return (text || "")
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function parseGvizResponse(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) throw new Error("Unexpected response format from Google Sheets");
    const json = JSON.parse(match[1]);
    const cols = json.table.cols.map((c) => (c.label || "").trim());
    return (json.table.rows || []).map((row) => {
        const obj = {};
        cols.forEach((label, i) => {
            const cell = row.c && row.c[i];
            obj[label] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : cell.v) : "";
        });
        return obj;
    });
}

// Fetches one tab of the sheet by name and returns its rows as plain
// objects keyed by column header, or null if unconfigured/unreachable.
function fetchSheetTab(tabName) {
    if (!SHEET_ID) return Promise.resolve(null);

    // The timestamp keeps every request on a fresh URL so neither the
    // browser nor any intermediate cache ever hands back a stale sheet.
    const url =
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json` +
        `&sheet=${encodeURIComponent(tabName)}&_=${Date.now()}`;

    return fetch(url, { cache: "no-store" })
        .then((res) => {
            if (!res.ok) throw new Error("Sheet fetch failed with status " + res.status);
            return res.text();
        })
        .then(parseGvizResponse)
        .catch((err) => {
            console.warn(`Could not load the "${tabName}" tab from Google Sheets:`, err);
            return null;
        });
}

// ------------------------------------------------------------------
// PAGE TEXT & LINKS — the "Page Content" tab (Key | Value).
// Any element on the page can opt in to being editable from Sheets:
//   <h1 data-cms="Home / Hero Title">Fallback text stays if unset</h1>
//   <img data-cms-src="About / Photo URL">
//   <a data-cms-href="Contact / Instagram URL">
// The attribute's text must match a row's Key exactly.
// ------------------------------------------------------------------
function applyPageContent() {
    fetchSheetTab("Page Content").then((rows) => {
        if (!rows) return;

        const lookup = {};
        rows.forEach((r) => {
            const key = (r["Key"] || "").toString().trim();
            const value = (r["Value"] || "").toString().trim();
            if (key && value) lookup[key] = value;
        });

        document.querySelectorAll("[data-cms]").forEach((el) => {
            const value = lookup[el.getAttribute("data-cms")];
            if (value) el.textContent = value;
        });

        document.querySelectorAll("[data-cms-src]").forEach((el) => {
            const value = lookup[el.getAttribute("data-cms-src")];
            if (value) {
                el.src = value;
                el.classList.remove("is-hidden");
                const fallback = document.querySelector(el.getAttribute("data-cms-fallback-hide") || "");
                if (fallback) fallback.classList.add("is-hidden");
            }
        });

        document.querySelectorAll("[data-cms-href]").forEach((el) => {
            const value = lookup[el.getAttribute("data-cms-href")];
            if (value) el.href = value;
        });

        // Keep the "Email Directly" mailto link in sync with the address text.
        const emailAnchor = document.getElementById("contact-email-anchor");
        if (emailAnchor && lookup["Contact / Email"]) {
            emailAnchor.href = "mailto:" + lookup["Contact / Email"];
        }
    });
}

applyPageContent();

// ------------------------------------------------------------------
// JOURNAL POSTS — the "Posts" tab.
// ------------------------------------------------------------------

// Assigns a color tone to each category the first time it's seen, so
// any category name works without the code needing to know it exists.
const TONE_CLASSES = ["tone-a", "tone-b", "tone-c"];
function makeCategoryToneMap(categories) {
    const map = {};
    let i = 0;
    categories.forEach((cat) => {
        if (!map[cat]) {
            map[cat] = TONE_CLASSES[i % TONE_CLASSES.length];
            i++;
        }
    });
    return map;
}

function fetchPosts() {
    return fetchSheetTab("Posts").then((rows) => {
        if (!rows) return null;
        return rows
            .filter((r) => (r["Published"] || "").toString().trim().toLowerCase() === "yes")
            .map((r) => ({
                title: (r["Title"] || "").toString().trim(),
                category: (r["Category"] || "").toString().trim(),
                date: (r["Date"] || "").toString().trim(),
                summary: (r["Summary"] || "").toString().trim(),
                image: (r["Image URL"] || "").toString().trim(),
                body: (r["Body"] || "").toString(),
                slug: slugify(r["Title"]),
            }))
            .filter((p) => p.title)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    });
}

function postCardHTML(post) {
    return (
        '<article class="post-card">' +
        '<span class="post-tag">' + escapeHtml(post.category) + "</span>" +
        "<h3>" + escapeHtml(post.title) + "</h3>" +
        "<p>" + escapeHtml(post.summary) + "</p>" +
        '<a href="post.html?post=' + encodeURIComponent(post.slug) + '" class="link-arrow">Read the post →</a>' +
        "</article>"
    );
}

// Home page: swap the placeholder "Recent Journal" cards for the 3 newest posts.
const recentGrid = document.getElementById("recent-posts-grid");
if (recentGrid) {
    fetchPosts().then((posts) => {
        if (!posts || !posts.length) return;
        recentGrid.innerHTML = posts.slice(0, 3).map(postCardHTML).join("");
    });
}

// Journal page: render every published post.
const allPostsGrid = document.getElementById("all-posts-grid");
if (allPostsGrid) {
    fetchPosts().then((posts) => {
        if (!posts || !posts.length) return;
        allPostsGrid.innerHTML = posts.map(postCardHTML).join("");
        const empty = document.getElementById("journal-empty-note");
        if (empty) empty.classList.add("is-hidden");
    });
}

// Post detail page: render the single post matching ?post=slug.
const postDetail = document.getElementById("post-detail");
if (postDetail) {
    const slug = new URLSearchParams(window.location.search).get("post") || "";

    fetchPosts().then((posts) => {
        const post = posts ? posts.find((p) => p.slug === slug) : null;
        const toneMap = makeCategoryToneMap(posts ? posts.map((p) => p.category) : []);

        if (!post) {
            postDetail.innerHTML =
                '<p class="section-kicker">Hmm</p>' +
                "<h1>Post not found</h1>" +
                '<p class="hero-description" style="margin: 0 auto 30px;">That post may have been moved, renamed, or isn\'t published yet.</p>' +
                '<p class="read-more"><a href="journal.html">← Back to the Journal</a></p>';
            return;
        }

        document.title = post.title + " | The Art Of...";

        const bodyHtml = post.body
            .split(/\n+/)
            .filter((p) => p.trim())
            .map((para) => "<p>" + escapeHtml(para.trim()) + "</p>")
            .join("");

        const mediaHtml = post.image
            ? '<img src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(post.title) + '" class="post-hero-image">'
            : '<div class="post-hero-fallback ' + (toneMap[post.category] || "tone-a") + '"></div>';

        postDetail.innerHTML =
            '<p class="section-kicker">' + escapeHtml(post.category) + "</p>" +
            "<h1>" + escapeHtml(post.title) + "</h1>" +
            '<p class="post-detail-date">' + escapeHtml(post.date) + "</p>" +
            mediaHtml +
            '<div class="post-body">' + bodyHtml + "</div>" +
            '<p class="read-more"><a href="journal.html">← Back to the Journal</a></p>';
    });
}

// ------------------------------------------------------------------
// GALLERY — the "Artwork" tab, with a simple click-to-enlarge lightbox.
// ------------------------------------------------------------------
const galleryGrid = document.getElementById("gallery-grid");
if (galleryGrid) {
    fetchSheetTab("Artwork").then((rows) => {
        if (!rows) return;

        const pieces = rows
            .filter((r) => (r["Published"] || "").toString().trim().toLowerCase() === "yes")
            .map((r) => ({
                title: (r["Title"] || "").toString().trim(),
                medium: (r["Medium"] || "").toString().trim(),
                date: (r["Date"] || "").toString().trim(),
                image: (r["Image URL"] || "").toString().trim(),
                description: (r["Description"] || "").toString().trim(),
            }))
            .filter((p) => p.title && p.image)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (!pieces.length) return;

        galleryGrid.innerHTML = pieces
            .map(
                (p, i) =>
                    '<figure class="gallery-card" data-piece-index="' + i + '">' +
                    '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' +
                    '<figcaption>' +
                    "<h3>" + escapeHtml(p.title) + "</h3>" +
                    (p.medium ? '<span class="gallery-medium">' + escapeHtml(p.medium) + "</span>" : "") +
                    "</figcaption>" +
                    "</figure>"
            )
            .join("");

        const empty = document.getElementById("gallery-empty-note");
        if (empty) empty.classList.add("is-hidden");

        const lightbox = document.getElementById("lightbox");
        const lightboxImg = document.getElementById("lightbox-image");
        const lightboxTitle = document.getElementById("lightbox-title");
        const lightboxMeta = document.getElementById("lightbox-meta");
        const lightboxDesc = document.getElementById("lightbox-description");

        function openLightbox(piece) {
            lightboxImg.src = piece.image;
            lightboxImg.alt = piece.title;
            lightboxTitle.textContent = piece.title;
            lightboxMeta.textContent = [piece.medium, piece.date].filter(Boolean).join(" · ");
            lightboxDesc.textContent = piece.description;
            lightbox.classList.add("is-open");
        }

        galleryGrid.addEventListener("click", (e) => {
            const card = e.target.closest(".gallery-card");
            if (!card) return;
            openLightbox(pieces[Number(card.getAttribute("data-piece-index"))]);
        });

        if (lightbox) {
            lightbox.addEventListener("click", (e) => {
                if (e.target === lightbox || e.target.classList.contains("lightbox-close")) {
                    lightbox.classList.remove("is-open");
                }
            });
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape") lightbox.classList.remove("is-open");
            });
        }
    });
}

// Gentle fade-up reveal as sections enter the viewport.
document.addEventListener("DOMContentLoaded", () => {
    const reveals = document.querySelectorAll(".reveal");

    if ("IntersectionObserver" in window && reveals.length) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        reveals.forEach((el) => observer.observe(el));
    } else {
        reveals.forEach((el) => el.classList.add("is-visible"));
    }
});

// Netlify Forms: submit via fetch so we can show an inline thank-you
// message instead of redirecting away to a blank success page.
const contactForm = document.getElementById("contact-form");

if (contactForm) {
    const statusEl = document.getElementById("form-status");

    const encode = (data) =>
        Object.keys(data)
            .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
            .join("&");

    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const payload = {};
        formData.forEach((value, key) => (payload[key] = value));

        statusEl.textContent = "Sending…";
        statusEl.classList.remove("error");

        fetch("/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encode(payload),
        })
            .then(() => {
                statusEl.textContent = "Thank you — your message is on its way!";
                contactForm.reset();
            })
            .catch(() => {
                statusEl.textContent = "Something went wrong. Please try emailing directly instead.";
                statusEl.classList.add("error");
            });
    });
}
