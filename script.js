// ------------------------------------------------------------------
// POSTS DATA SOURCE — a published Google Sheet, read-only.
// Paste your Sheet ID below once (see README for how to set the sheet
// up). Until then this stays blank and the site quietly falls back to
// the static placeholder posts already written into the HTML.
// ------------------------------------------------------------------
const POSTS_SHEET_ID = "";

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

function categoryTone(category) {
    const map = {
        "Mindset & Money": "tone-a",
        "Daily Finance": "tone-b",
        "Growth & Learning": "tone-c",
    };
    return map[category] || "tone-a";
}

function parseGvizResponse(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) throw new Error("Unexpected response format from Google Sheets");
    const json = JSON.parse(match[1]);
    const cols = json.table.cols.map((c) => (c.label || "").trim());
    return json.table.rows.map((row) => {
        const obj = {};
        cols.forEach((label, i) => {
            const cell = row.c && row.c[i];
            obj[label] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : cell.v) : "";
        });
        return obj;
    });
}

// Resolves to an array of published posts (newest first), or null if
// the sheet isn't configured yet or couldn't be reached — callers
// should treat null as "keep whatever is already on the page."
function fetchPosts() {
    if (!POSTS_SHEET_ID) return Promise.resolve(null);

    const url = `https://docs.google.com/spreadsheets/d/${POSTS_SHEET_ID}/gviz/tq?tqx=out:json`;

    return fetch(url)
        .then((res) => {
            if (!res.ok) throw new Error("Sheet fetch failed with status " + res.status);
            return res.text();
        })
        .then(parseGvizResponse)
        .then((rows) =>
            rows
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
                .sort((a, b) => new Date(b.date) - new Date(a.date))
        )
        .catch((err) => {
            console.warn("Could not load posts from Google Sheet:", err);
            return null;
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

// Home page: swap the placeholder "Recent Reads" cards for the 3 newest posts.
const recentGrid = document.getElementById("recent-posts-grid");
if (recentGrid) {
    fetchPosts().then((posts) => {
        if (!posts || !posts.length) return;
        recentGrid.innerHTML = posts.slice(0, 3).map(postCardHTML).join("");
    });
}

// Explore page: reveal a full grid of every published post.
const allPostsSection = document.getElementById("all-posts-section");
const allPostsGrid = document.getElementById("all-posts-grid");
if (allPostsSection && allPostsGrid) {
    fetchPosts().then((posts) => {
        if (!posts || !posts.length) return;
        allPostsGrid.innerHTML = posts.map(postCardHTML).join("");
        allPostsSection.classList.add("is-active");
    });
}

// Post detail page: render the single post matching ?post=slug.
const postDetail = document.getElementById("post-detail");
if (postDetail) {
    const slug = new URLSearchParams(window.location.search).get("post") || "";

    fetchPosts().then((posts) => {
        const post = posts ? posts.find((p) => p.slug === slug) : null;

        if (!post) {
            postDetail.innerHTML =
                '<p class="section-kicker">Hmm</p>' +
                "<h1>Post not found</h1>" +
                '<p class="hero-description" style="margin: 0 auto 30px;">That post may have been moved, renamed, or isn\'t published yet.</p>' +
                '<p class="read-more"><a href="explore.html">← Back to the Archives</a></p>';
            return;
        }

        document.title = post.title + " | The Balance Sheet";

        const bodyHtml = post.body
            .split(/\n\s*\n/)
            .filter((p) => p.trim())
            .map((para) => "<p>" + escapeHtml(para.trim()).replace(/\n/g, "<br>") + "</p>")
            .join("");

        const mediaHtml = post.image
            ? '<img src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(post.title) + '" class="post-hero-image">'
            : '<div class="post-hero-fallback ' + categoryTone(post.category) + '"></div>';

        postDetail.innerHTML =
            '<p class="section-kicker">' + escapeHtml(post.category) + "</p>" +
            "<h1>" + escapeHtml(post.title) + "</h1>" +
            '<p class="post-detail-date">' + escapeHtml(post.date) + "</p>" +
            mediaHtml +
            '<div class="post-body">' + bodyHtml + "</div>" +
            '<p class="read-more"><a href="explore.html">← Back to the Archives</a></p>';
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
