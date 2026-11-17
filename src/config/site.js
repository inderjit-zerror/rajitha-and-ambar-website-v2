export const siteConfig = {
  name: "Rajitha & Ambar",
  description: "You are invited to the wedding celebrations of Rajitha Penaka & Ambar Kumar in Cannes, France.",
  url: "https://localhost:3000",
  locale: "en_IN",
  language: "en-IN",
  ogImage: "/og.png",
  keywords: ["Rajitha and Ambar", "wedding invitation", "Cannes wedding", "Sangeet", "Varmala", "Reception"],
  contact: {
    phone: "",
    email: "",
  },
  address: {
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN",
  },
  socials: {
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
  },
};

export const siteRoutes = [
  {
    path: "/",
    label: "Home",
    title: "Wedding Invitation",
    description: siteConfig.description,
    priority: 1,
  },
  {
    path: "/about",
    label: "About",
    title: "About",
    description: "",
    priority: 0.8,
  },
  {
    path: "/contact",
    label: "Contact",
    title: "Contact",
    description: "",
    priority: 0.7,
  },
];
