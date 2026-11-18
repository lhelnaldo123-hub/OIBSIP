// The ready-made pizzas on the menu. Each one points at inventory items by name,
// so those items cannot be renamed (the admin route checks this list).
const VARIETIES = [
  { name: "Margherita", desc: "Classic tomato and mozzarella", base: "Thin Crust", sauce: "Tomato Basil", cheese: "Mozzarella", veggies: ["Tomato"] },
  { name: "Farmhouse", desc: "Loaded with fresh vegetables", base: "Thick Crust", sauce: "Tomato Basil", cheese: "Mozzarella", veggies: ["Mushroom", "Onion", "Bell Pepper", "Sweetcorn"] },
  { name: "BBQ Veggie", desc: "Smoky barbecue and cheddar", base: "Whole Wheat", sauce: "BBQ", cheese: "Cheddar", veggies: ["Onion", "Bell Pepper", "Sweetcorn"] },
  { name: "Pesto Delight", desc: "Green pesto on a cheese burst base", base: "Cheese Burst", sauce: "Pesto", cheese: "Mozzarella", veggies: ["Olives", "Tomato", "Mushroom"] },
  { name: "Spicy Garden", desc: "Hot arrabbiata with crunchy veg", base: "Thin Crust", sauce: "Spicy Arrabbiata", cheese: "Cheddar", veggies: ["Bell Pepper", "Olives", "Onion"] },
];

// True if a menu pizza uses the item with this type and name.
const usedByMenu = (type, name) =>
  VARIETIES.some((v) => (type === "base" && v.base === name) || (type === "sauce" && v.sauce === name) ||
    (type === "cheese" && v.cheese === name) || (type === "veggie" && v.veggies.includes(name)));

module.exports = { VARIETIES, usedByMenu };
