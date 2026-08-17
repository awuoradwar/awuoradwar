// Store content pack: ONE store's real operational content -- proprietary
// procedure names, terminology, and schedules -- as plain data, not code.
// seed.js is a generic engine that reads whatever content pack it's given
// (see SEED_CONTENT_PACK below); it contains no store-specific wording of
// its own. To seed a different store, write a new file in this shape and
// point seed.js at it -- never add another store's content directly into
// seed.js itself.
//
// Users are referenced elsewhere in this file by email; seed.js resolves
// those to real user IDs once it has created the users below.
module.exports = {
  store: {
    name: "Panda Express #2417",
    timezone: "America/Chicago",
    languageDefault: "en",
  },

  users: [
    { name: "Jordan Ellis", email: "gm@shiftops.demo", position: "GM", language: "en" },
    { name: "Priya Nair", email: "am@shiftops.demo", position: "ASSISTANT_MANAGER", language: "en" },
    { name: "Mateo Alvarez", email: "chef@shiftops.demo", position: "CHEF", language: "es" },
    { name: "Sam Cole", email: "visiting@shiftops.demo", position: "VISITING_MANAGER", language: "en" },
  ],

  // Weekly recurring management rhythm.
  taskTemplates: [
    // Daily manager routine -- the first four are checked early in the shift
    // (Opening Ready); the cleaning/acknowledgement review is due at 20:00,
    // the natural end-of-day check (Closing Complete).
    { title: "Check WorkJam & action required items", titleEs: "Revisar WorkJam y atender los elementos requeridos", category: "ROUTINE", recurrenceType: "DAILY", config: { dueTime: "10:00" }, effort: "QUICK", checklistRole: "OPENING" },
    { title: "Check Trends & complete/update required items", titleEs: "Revisar Trends y completar/actualizar los elementos requeridos", category: "ROUTINE", recurrenceType: "DAILY", config: { dueTime: "10:00" }, effort: "QUICK", checklistRole: "OPENING" },
    { title: "Review & approve Legion timesheets", titleEs: "Revisar y aprobar las hojas de horario en Legion", category: "ROUTINE", recurrenceType: "DAILY", config: { dueTime: "12:00" }, effort: "STANDARD", checklistRole: "OPENING" },
    { title: "Review company email & convert follow-ups into tasks", titleEs: "Revisar el correo de la empresa y convertir pendientes en tareas", category: "ROUTINE", recurrenceType: "DAILY", config: { dueTime: "11:00" }, effort: "STANDARD", checklistRole: "OPENING" },
    { title: "Review daily cleaning status & outstanding acknowledgements", titleEs: "Revisar el estado de limpieza diaria y las confirmaciones pendientes", category: "ROUTINE", recurrenceType: "DAILY", config: { dueTime: "20:00" }, effort: "QUICK", checklistRole: "CLOSING" },

    // Monday
    { title: "Receive truck", titleEs: "Recibir camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [1], dueTime: "09:00" }, effort: "MAJOR", verify: true },
    { title: "Place truck order", titleEs: "Hacer el pedido del camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [1], dueTime: "14:00" }, effort: "STANDARD" },

    // Tuesday
    { title: "Loomis change order", titleEs: "Orden de cambio Loomis", description: "Submit before 11:00 AM", category: "LOOMIS", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "11:00" }, effort: "QUICK" },
    { title: "GEM call (conditional)", titleEs: "Llamada GEM (condicional)", description: "9:00-10:00 AM, required only when weekly guest-expectation survey performance triggers it", category: "MEETING", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "10:00", conditionalMeetingType: "GEM_CALL" }, effort: "STANDARD" },
    { title: "Area weekly meeting", titleEs: "Reunión semanal de área", description: "10:00-11:00 AM", category: "MEETING", recurrenceType: "WEEKLY", config: { weekdays: [2], dueTime: "11:00" }, effort: "STANDARD" },

    // Wednesday
    { title: "Receive truck", titleEs: "Recibir camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "09:00" }, effort: "MAJOR", verify: true },
    { title: "Place truck order", titleEs: "Hacer el pedido del camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "14:00" }, effort: "STANDARD" },
    { title: "Complete & publish store schedule", titleEs: "Completar y publicar el horario de la tienda", description: "Must publish by 11:00 PM", category: "DEADLINE", recurrenceType: "WEEKLY", config: { weekdays: [3], dueTime: "23:00" }, effort: "MAJOR" },

    // Thursday
    { title: "Place truck order", titleEs: "Hacer el pedido del camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [4], dueTime: "14:00" }, effort: "STANDARD" },

    // Friday
    { title: "Receive truck", titleEs: "Recibir camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [5], dueTime: "09:00" }, effort: "MAJOR", verify: true },
    { title: "Place truck order", titleEs: "Hacer el pedido del camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [5], dueTime: "14:00" }, effort: "STANDARD" },

    // Saturday
    { title: "Receive truck", titleEs: "Recibir camión", category: "TRUCK", recurrenceType: "WEEKLY", config: { weekdays: [6], dueTime: "09:00" }, effort: "MAJOR", verify: true },
    { title: "Complete night inventory", titleEs: "Completar el inventario nocturno", category: "INVENTORY", recurrenceType: "WEEKLY", config: { weekdays: [6], dueTime: "23:00" }, effort: "MAJOR", verify: true },

    // Sunday
    { title: "Loomis change order", titleEs: "Orden de cambio Loomis", description: "Submit before 11:00 AM", category: "LOOMIS", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "11:00" }, effort: "QUICK" },
    { title: "Verify Saturday inventory & post", titleEs: "Verificar el inventario del sábado y publicarlo", description: "Double-check Saturday inventory, correct if needed, then post.", category: "INVENTORY", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "12:00", dependsOnTemplateTitle: "Complete night inventory" }, effort: "STANDARD", verify: true },
    { title: "Send weekly store numbers to SCO/crew", titleEs: "Enviar los números semanales de la tienda a SCO/equipo", category: "ROUTINE", recurrenceType: "WEEKLY", config: { weekdays: [0], dueTime: "18:00" }, effort: "STANDARD" },
  ],

  meetings: [
    { type: "GEM_CALL", weekday: 2, startTime: "09:00", endTime: "10:00", conditional: true, requiredState: "REQUIRED" },
    { type: "AREA_WEEKLY", weekday: 2, startTime: "10:00", endTime: "11:00", conditional: false, requiredState: "REQUIRED" },
  ],

  cleaningAreas: [
    { key: "foh", name: "FOH - Dining & Front Counter", nameEs: "FOH - Comedor y Mostrador", category: "FOH", ownerEmail: "am@shiftops.demo" },
    { key: "boh", name: "BOH - Cook Line & Prep", nameEs: "BOH - Línea de Cocina y Preparación", category: "BOH", ownerEmail: "chef@shiftops.demo" },
    { key: "fac", name: "Facilities / Exterior", nameEs: "Instalaciones / Exterior", category: "FACILITIES", ownerEmail: "gm@shiftops.demo" },
  ],

  cleaningTasks: [
    { areaKey: "foh", title: "Dining room tables & floor", titleEs: "Mesas y piso del comedor", frequency: "DAILY", associateName: "Ana R.", managerOwnerEmail: "am@shiftops.demo", photoRequired: false },
    { areaKey: "foh", title: "Restrooms", titleEs: "Baños", frequency: "DAILY", associateName: "Ana R.", managerOwnerEmail: "am@shiftops.demo", photoRequired: false },
    { areaKey: "foh", title: "Beverage area", titleEs: "Área de bebidas", frequency: "DAILY", associateName: "Luis M.", managerOwnerEmail: "am@shiftops.demo", photoRequired: false },
    { areaKey: "boh", title: "Walk-in organization & temp check", titleEs: "Organización del walk-in y control de temperatura", frequency: "DAILY", associateName: "Diego F.", managerOwnerEmail: "chef@shiftops.demo", photoRequired: true },
    { areaKey: "boh", title: "Cook line deep wipe-down", titleEs: "Limpieza profunda de la línea de cocina", frequency: "WEEKLY", associateName: "Diego F.", managerOwnerEmail: "chef@shiftops.demo", photoRequired: false },
    { areaKey: "boh", title: "Dish pit", titleEs: "Área de lavado de platos", frequency: "DAILY", associateName: "Kevin S.", managerOwnerEmail: "chef@shiftops.demo", photoRequired: false },
    { areaKey: "fac", title: "Dumpster area", titleEs: "Área del contenedor de basura", frequency: "WEEKLY", associateName: "Kevin S.", managerOwnerEmail: "gm@shiftops.demo", photoRequired: false },
    { areaKey: "fac", title: "Perimeter / parking lot", titleEs: "Perímetro / estacionamiento", frequency: "WEEKLY", associateName: "Luis M.", managerOwnerEmail: "gm@shiftops.demo", photoRequired: false },
  ],

  // Weekly deep-clean rotation (from the store's "5 Point 7 Action" board).
  // One FOH + one BOH deep-clean area per weekday, 0=Sun..6=Sat. Each area
  // gets its own single task carrying the full checklist as its description.
  deepCleanRotation: [
    {
      weekday: 0,
      foh: { name: "Dining Room & Entrances", title: "Scrub Dining Room Floor, Entrances, Doors", description: "Lobby floor/grout, including all metal parts and ledges, windows and door frame, spider web, under drink station." },
      boh: { name: "Cook Range", title: "Deep Clean Cook Range", description: "Hoods, lights, globes, Ansul poles and tips, faucets, blancher, wok rings, under cooking range, pipes, drains." },
    },
    {
      weekday: 1,
      foh: { name: "Serving Line & DT Area", title: "Deep Clean Serving Line & Drive-Thru Area", description: "Serving line shelves, induction unit, heat lamps, condiment cart/shelf, rice warmer, drink station, ice chute, cabinet, DT window, walls, Ironman sign, register, behind/under registers, order taker screen and cables, phones." },
      boh: { name: "Prep Cooler (Main) & Reach-in Freezer", title: "Deep Clean Prep Cooler (Main) & Reach-in Freezer", description: "Deep clean and polish, gaskets, wheels, vent, cables, doors, hinges, cover panel, meat drawers and sliders." },
    },
    {
      weekday: 2,
      foh: { name: "Restrooms Deep Clean", title: "Deep Clean Restrooms", description: "Restroom door frames, doors, toe kick, walls cleaned with wet towel, baseboards, vents, lights cleaned, underside of toilet and sink." },
      boh: { name: "Prep Cooler (Side), Rice Cabinet & Condiment Cart", title: "Deep Clean Prep Cooler (Side), Rice Cabinet & Condiment Cart", description: "Deep clean and polish, gaskets, wheels, vent, cables, doors, hinges, cover panel, warmer water reservoir, remove warmer metal parts, clean, replace, deep clean cook's condiment cart." },
    },
    {
      weekday: 3,
      foh: { name: "Drive Thru Exterior, Dumpster & Parking Lot", title: "Deep Clean Drive Thru Exterior, Dumpster & Parking Lot", description: "Canopy, metal part above the drive-thru window, splatter on building, oil and tire marks, dumpster, sweep leaves and dirt, no clutter, scrub concrete, remove oil stains." },
      boh: { name: "Prep & Dishwashing Sink", title: "Deep Clean Prep & Dishwashing Sink", description: "Clean top to bottom, under shelves, pipes, drains, rice bin, 3-compartment sink." },
    },
    {
      weekday: 4,
      foh: { name: "Lobby Drink Station Deep Clean", title: "Deep Clean Lobby Drink Station", description: "Ice bin/chute, detail drink station, tea machine, under tea machine, cutlery holders cleaned, drink station drain, floor drain, cabinet doors and feet." },
      boh: { name: "BOH Floors, Walk-in Freezer & Cooler", title: "Buff Floors & Deep Clean Walk-in Freezer/Cooler", description: "Grout, baseboards, all BOH floors, sweep & dry mop freezer floor, buff walk-in cooler floor, clean plastic curtains, gaskets, veggie display doors, doorframe, shelves wiped clean with rag." },
    },
    {
      weekday: 5,
      foh: { name: "Manager Station, Air Vents & Lobby Furniture", title: "Organize Manager Station & Clean Air Vents, Chairs, Tables", description: "Remove clutter, organize manager station, polish keyboard, mouse, monitor, lobby vents, air ducts wipe clean with wet rag, lobby chairs, highchairs, tables, table legs." },
      boh: { name: "Walls, Storage, Mop Sink & Lockers", title: "Clean Walls, Storage, Mop Sink & Lockers", description: "Clean walls, back door, air curtain, organize shelves, clean and organize mop sink area, clean lockers (only personal items, no food or drink)." },
    },
    {
      weekday: 6,
      foh: { name: "Serving Table & DT Floors", title: "Buff Serving Table Floors, DT Floors, Drains", description: "Baseboards, legs, detail clean drains, grout, buff floor, under serving table, walls." },
      boh: { name: "Grill Station, Oil Filter & Fryers", title: "Detail Grill Station, Oil Filter Machine & Fryers", description: "Including table, bottom of grill, back wall and side, deep clean both fryers inside and outside & fryer doors, filter machine clean top to bottom." },
    },
  ],

  // A few live example records so the demo isn't an empty shell.
  exampleRecords: {
    guestRecovery: {
      contactChannel: "PHONE",
      orderChannel: "ONLINE",
      issueCategory: "ACCURACY",
      description: "Guest called about missing item on online order #48213.",
      replacementStatus: "PENDING",
      createdByEmail: "am@shiftops.demo",
      picEmail: "gm@shiftops.demo",
    },
    borrowedItem: {
      borrowedFrom: "Store #2205",
      item: "White rice (cases)",
      quantity: 2,
      unit: "case",
      ownerEmail: "chef@shiftops.demo",
      status: "OPEN",
      createdByEmail: "chef@shiftops.demo",
    },
    issue: {
      category: "EQUIPMENT",
      description: "Walk-in freezer running warm, technician not yet scheduled.",
      severity: "CRITICAL",
      status: "OPEN",
      ownerEmail: "chef@shiftops.demo",
      createdByEmail: "chef@shiftops.demo",
    },
    scheduleRequest: {
      associateName: "Ana R.",
      requestType: "FULL_DAY_OFF",
      requestedStartDateOffsetDays: 5,
      receivedVia: "TEXT",
      receivedByEmail: "chef@shiftops.demo",
      enteredByEmail: "chef@shiftops.demo",
      notes: "Family event",
      status: "PENDING_GM_APPROVAL",
    },
  },
};
