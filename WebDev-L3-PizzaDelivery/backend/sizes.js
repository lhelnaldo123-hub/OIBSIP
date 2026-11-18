// Pizza sizes. Edit the numbers here to change prices and ingredient use.
//   mult      = the price is the Regular price multiplied by this
//   portions  = how many units of EACH ingredient one pizza of this size uses
// Regular is 1 unit of each ingredient, exactly as before sizes existed.
const SIZES = [
  { key: "R", label: "Regular", mult: 1, portions: 1 },
  { key: "L", label: "Large", mult: 1.6, portions: 2 },
  { key: "F", label: "Family", mult: 2.2, portions: 3 },
];

const sizeOf = (key) => SIZES.find((s) => s.key === String(key || "R"));

module.exports = { SIZES, sizeOf };
