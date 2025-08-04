let wines = [
  {
    id: 0,
    name: "Cabernet Sauvignon",
    type: "Vörös",
    style: "Száraz",
    price: "80-130",
    flavor: "Fűszeres",
    ratings: [],
    is_confirmed: true,
  },
  {
    id: 1,
    name: "Chardonnay",
    type: "Fehér",
    style: "Félszáraz",
    price: "50-80",
    flavor: "Gyümölcsös",
    ratings: [],
    is_confirmed: true,
  },
  {
    id: 2,
    name: "Tokaji Aszú",
    type: "Fehér",
    style: "Édes",
    price: ">130",
    flavor: "Egyéb",
    ratings: [],
    is_confirmed: true,
  },
  {
    id: 3,
    name: "Kékfrankos Rosé",
    type: "Rozé",
    style: "Száraz",
    price: "20-50",
    flavor: "Virágos",
    ratings: [],
    is_confirmed: true,
  },
  {
    id: 4,
    name: "Merlot",
    type: "Vörös",
    style: "Félédes",
    price: "50-80",
    flavor: "Földes",
    ratings: [],
    is_confirmed: true,
  },
];

function getAllWines() {
  return wines;
}
let nextId = wines.length;
function addRating(wineName, rating, comment) {
  const wine = wines.find((w) => w.name === wineName);
  if (wine) {
    wine.ratings.push({ rating, comment });
    return wine;
  }
  return null;
}
function addNewWine(wine) {
  const newWine = {
    id: nextId++,
    ...wine,
    ratings: [],
    is_confirmed: wine.is_confirmed ?? false,
  };
  wines.push(newWine);
  return newWine;
}

function approveWine(id) {
  const wine = wines.find((w) => w.id === id);
  if (wine) wine.is_confirmed = true;
  return wine;
}

function updateWine(updatedWine) {
  const index = wines.findIndex((w) => w.id === updatedWine.id);
  if (index !== -1) {
    wines[index] = { ...updatedWine, is_confirmed: true };
    return wines[index];
  }
  return null;
}

function deleteWine(id) {
  const index = wines.findIndex((w) => w.id === id);
  if (index !== -1) {
    const deleted = wines.splice(index, 1);
    return deleted[0];
  }
  return null;
}

module.exports = {
  getAllWines,
  addNewWine,
  approveWine,
  updateWine,
  deleteWine,
  addRating,
};
