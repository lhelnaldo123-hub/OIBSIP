const u = (id) => "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=900&q=70";
const wm = (file) => "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file) + "?width=400";

window.HERO_IMG = u("1513104890138-7c749659a591");
window.DEFAULT_IMG = u("1565299624946-b28f40a0ae38");
window.AUTH_IMG = u("1590947132387-155cc02f3212");
window.GALLERY = [
  u("1574071318508-1cdbab80d002"),
  u("1593560708920-61dd98c46a4e"),
  u("1604382354936-07c5d9983bd3"),
];
window.PIZZA_IMG = {
  "Margherita": u("1574071318508-1cdbab80d002"),
  "Farmhouse": u("1565299624946-b28f40a0ae38"),
  "BBQ Veggie": u("1593560708920-61dd98c46a4e"),
  "Pesto Delight": u("1604382354936-07c5d9983bd3"),
  "Spicy Garden": u("1595854341625-f33ee10dbf94"),
};

/* Ingredient photos. If a link is dead, an emoji is shown instead.
   To use your own: paste any image link, or "img/corn.jpg" after uploading to frontend/img/ */
window.ING_IMG = {
  "Mushroom": wm("Agaricus bisporus.jpg"),
  "Onion": wm("Onions.jpg"),
  "Bell Pepper": wm("Green bell pepper.jpg"),
  "Olives": wm("Black olives.jpg"),
  "Sweetcorn": wm("Corncobs.jpg"),
  "Tomato": wm("Tomato.jpg"),
  "Mozzarella": wm("Mozzarella.jpg"),
  "Cheddar": wm("Cheddar cheese.jpg"),
};