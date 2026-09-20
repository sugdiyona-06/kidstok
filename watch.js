// Eski /watch?id=... havolalari endi Shorts lentasiga olib boradi
const id = new URLSearchParams(location.search).get("id");
location.replace(id ? `/shorts?start=${encodeURIComponent(id)}` : "/shorts");
