/** Deterministic synthetic data for isolated visual tests. Never used by the personal profile. */
export function demoLedger(today) {
  const current = today.slice(0, 7);
  const shift = (offset) => {
    const [y, m] = current.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
  };
  const first = shift(-11);
  const accounts = [
    { id: "demo:bank", name: "Conta principal" },
    { id: "demo:reserve", name: "Reserva e investimentos" },
    { id: "demo:credit", name: "Cartão de crédito" },
  ];
  const categories = [
    "Moradia",
    "Alimentação",
    "Restaurantes",
    "Transporte",
    "Saúde",
    "Lazer",
    "Assinaturas",
  ].map((name, i) => ({ id: `demo:category-${i}`, name }));
  const transactions = [];
  function add(id, date, amount, description, category, extras = {}) {
    if (date > today && !extras.planned) return;
    const { planned: _, ...rest } = extras;
    transactions.push({
      id,
      date,
      amount,
      description,
      accountId: accounts[0].id,
      categoryId: category === null ? null : categories[category].id,
      notes: "DADOS FICTÍCIOS · perfil de teste",
      tagIds: [],
      transfer: false,
      openingBalance: false,
      recurrenceId: null,
      ...rest,
    });
  }
  add("demo:opening", `${first}-01`, 3250000, "Saldo inicial", null, {
    openingBalance: true,
  });
  add("demo:reserve-opening", `${first}-01`, 1800000, "Reserva inicial", null, {
    openingBalance: true,
    accountId: accounts[1].id,
  });
  add("demo:credit-opening", `${first}-01`, -230000, "Fatura inicial", null, {
    openingBalance: true,
    accountId: accounts[2].id,
  });
  for (let offset = -11; offset <= 0; offset++) {
    const month = shift(offset),
      i = offset + 11;
    add(
      `demo:salary:${month}`,
      `${month}-05`,
      i > 5 ? 1040000 : 970000,
      "Salário",
      null,
    );
    add(`rec:demo:rent:${month}-08`, `${month}-08`, -225000, "Aluguel", 0, {
      recurrenceId: "demo:rent",
    });
    add(
      `demo:power:${month}`,
      `${month}-12`,
      -21000 - (i % 3) * 2500,
      "Energia",
      0,
    );
    for (let week = 0; week < 4; week++) {
      const day = String(4 + week * 7).padStart(2, "0");
      add(
        `demo:food:${month}:${week}`,
        `${month}-${day}`,
        -24000 - (i % 4) * 3200 - week * 1500,
        `Supermercado ${week % 2 ? "Central" : "Bairro"}`,
        1,
        { accountId: accounts[2].id },
      );
      add(
        `demo:restaurant:${month}:${week}`,
        `${month}-${day}`,
        -7000 - i * 1250 - week * 800,
        week % 2 ? "Delivery" : "Restaurante",
        2,
      );
    }
    add(
      `demo:transport:${month}`,
      `${month}-06`,
      -22000 - (i % 4) * 6000,
      "Combustível",
      3,
    );
    add(
      `demo:transport2:${month}`,
      `${month}-18`,
      -8500 - (i % 3) * 1700,
      "Aplicativos de transporte",
      3,
    );
    add(
      `demo:health:${month}`,
      `${month}-11`,
      -12500 - (i % 2) * 3400,
      "Farmácia",
      4,
    );
    if (i === 11)
      add(
        "demo:unexpected-health",
        `${month}-14`,
        -128000,
        "Exames e consulta",
        4,
      );
    add(
      `demo:leisure:${month}`,
      `${month}-16`,
      -26000 - (i % 4) * 16000,
      "Passeio e cinema",
      5,
    );
    add(`demo:streaming:${month}`, `${month}-03`, -5990, "Streaming", 6);
    add(`demo:cloud:${month}`, `${month}-10`, -2990, "Armazenamento", 6);
    add(
      `demo:reserve-out:${month}`,
      `${month}-07`,
      -120000,
      "Transferência para reserva",
      null,
      { transfer: true },
    );
    add(
      `demo:reserve-in:${month}`,
      `${month}-07`,
      120000,
      "Transferência da conta",
      null,
      { transfer: true, accountId: accounts[1].id },
    );
    add(
      `demo:card-out:${month}`,
      `${month}-02`,
      -118000,
      "Pagamento do cartão",
      null,
      { transfer: true },
    );
    add(
      `demo:card-in:${month}`,
      `${month}-02`,
      118000,
      "Pagamento recebido",
      null,
      { transfer: true, accountId: accounts[2].id },
    );
  }
  add("demo:planned-trip", `${shift(1)}-20`, -140000, "Reserva de viagem", 5, {
    planned: true,
  });
  const recurrences = [
    {
      id: "demo:rent",
      description: "Aluguel",
      accountId: accounts[0].id,
      amount: -225000,
      categoryId: categories[0].id,
      tagIds: [],
      notes: "",
      recurrenceId: null,
      startDate: `${first}-08`,
      endDate: null,
      frequency: "monthly",
      active: true,
    },
  ];
  return { accounts, categories, tags: [], transactions, recurrences };
}
