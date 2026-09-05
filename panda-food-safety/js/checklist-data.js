// Panda Food Safety Checklist — item data, transcribed from the paper
// "Panda Food Safety Checklist" walkthrough form. Bilingual (EN/ES).
// Each item's `id` is the item number on the paper form (1-65) and is
// used as the Firestore field key under `answers`, so it must stay
// stable even if wording is edited later.

const CHECKLIST_GROUPS = [
  {
    id: "front_of_house",
    en: "Front of the House",
    es: "Área de Atención al Cliente",
    sections: [
      {
        id: "thermometers",
        en: "Thermometers",
        es: "Termómetros",
        items: [
          { id: 1, en: "Are all thermometers calibrated to 32°F?", es: "¿Están todos los termómetros calibrados a 32°F?" },
          { id: 2, en: "Is there a dedicated thermometer for the Grilled Teriyaki Chicken station?", es: "¿Hay un termómetro exclusivo para la estación de Pollo Teriyaki a la Parrilla?" },
        ],
      },
      {
        id: "reach_in_cooler",
        en: "Reach-In Cooler",
        es: "Refrigerador Reach-In",
        items: [
          { id: 3, en: "All food held at <41°F at cooks line reach-in cooler?", es: "¿Todos los alimentos se mantienen a menos de 41°F en el refrigerador reach-in de la línea de cocina?" },
          { id: 4, en: "Is all raw chicken stored below other raw meats?", es: "¿Todo el pollo crudo se almacena debajo de otras carnes crudas?" },
          { id: 5, en: "Is all food covered with hard lids?", es: "¿Todos los alimentos están cubiertos con tapas rígidas?" },
          { id: 6, en: "Are all foods properly date marked?", es: "¿Todos los alimentos tienen la fecha correctamente marcada?" },
        ],
      },
      {
        id: "prep_cooler",
        en: "Prep Cooler",
        es: "Refrigerador de Preparación",
        items: [
          { id: 7, en: "Is kale and cabbage stored in the back of the prep cooler and not overfilled?", es: "¿La col rizada (kale) y el repollo se almacenan en la parte de atrás del refrigerador de preparación y sin sobrellenarlo?" },
        ],
      },
      {
        id: "hot_holding",
        en: "Hot Holding Table / Cooks Line",
        es: "Mesa de Mantenimiento en Caliente / Línea de Cocina",
        items: [
          { id: 8, en: "Are all the induction units plugged in and turned on? (Verify temp digital display is working)", es: "¿Todas las unidades de inducción están conectadas y encendidas? (Verifique que la pantalla digital de temperatura funcione)" },
          { id: 9, en: "All food held at >135°F on hot holding table?", es: "¿Todos los alimentos se mantienen a más de 135°F en la mesa de mantenimiento en caliente?", requiresActionPlan: true },
          { id: 10, en: "Are all the lights on for induction table?", es: "¿Están encendidas todas las luces de la mesa de inducción?" },
          { id: 11, en: "Is water temperature at hot holding steam table between 180°F - 200°F?", es: "¿La temperatura del agua en la mesa de vapor de mantenimiento en caliente está entre 180°F y 200°F?" },
          { id: 12, en: "Is steamed rice held >135°F in rice warmer and/or Rice Holding Unit?", es: "¿El arroz al vapor se mantiene a más de 135°F en el calentador de arroz y/o la Unidad de Retención de Arroz?" },
          { id: 13, en: "Is water temperature at Rice Holding Unit >144°F?", es: "¿La temperatura del agua en la Unidad de Retención de Arroz es mayor a 144°F?" },
        ],
      },
      {
        id: "final_cook_temp",
        en: "Final Cooking Temperature",
        es: "Temperatura Final de Cocción",
        items: [
          { id: 14, en: "Are all foods being cooked to a min. of 165°F?", es: "¿Todos los alimentos se cocinan a un mínimo de 165°F?" },
          { id: 15, en: "Are all the thickest parts of the Grilled Teriyaki Chicken >165°F before taken off the grill?", es: "¿Las partes más gruesas del Pollo Teriyaki a la Parrilla están por encima de 165°F antes de retirarlo de la parrilla?", alwaysPhoto: true },
        ],
      },
      {
        id: "walk_in_cooler",
        en: "Walk-in Cooler",
        es: "Refrigerador Walk-in (Cámara Fría)",
        items: [
          { id: 16, en: "All food held at <41°F in walk-in cooler?", es: "¿Todos los alimentos se mantienen a menos de 41°F en el refrigerador walk-in?", alwaysPhoto: true },
          { id: 17, en: "Is potentially hazardous (PHF/TCS) food being cooled from 140°F to 70°F within 2 hours and 69°F to 41°F in 4 hours? (Applies only to selective stores that allow cooling)", es: "¿Los alimentos potencialmente peligrosos (PHF/TCS) se enfrían de 140°F a 70°F en 2 horas y de 69°F a 41°F en 4 horas? (Aplica solo a tiendas seleccionadas que permiten el enfriamiento)" },
          { id: 18, en: "Is food thawed by an approved method?", es: "¿Los alimentos se descongelan usando un método aprobado?" },
          { id: 19, en: "Is all food covered with hard lids?", es: "¿Todos los alimentos están cubiertos con tapas rígidas?" },
          { id: 20, en: "Are all foods properly date marked?", es: "¿Todos los alimentos tienen la fecha correctamente marcada?" },
          { id: 21, en: "Are all food containers elevated 6\" off the floor?", es: "¿Todos los contenedores de alimentos están elevados 6 pulgadas del piso?" },
          { id: 22, en: "Are all ready-to-eat foods/vegetables above all raw meats?", es: "¿Todos los alimentos listos para comer/vegetales están por encima de todas las carnes crudas?" },
          { id: 23, en: "Is all raw chicken stored below other raw meats?", es: "¿Todo el pollo crudo se almacena debajo de otras carnes crudas?" },
        ],
      },
      {
        id: "food_contact_surfaces",
        en: "Food Contact Surfaces",
        es: "Superficies en Contacto con Alimentos",
        items: [
          { id: 24, en: "Are all slicers, mixers, and similar equipment washed, rinsed, and sanitized immediately after use?", es: "¿Todas las rebanadoras, mezcladoras y equipos similares se lavan, enjuagan y desinfectan inmediatamente después de usarse?", alwaysPhoto: true },
          { id: 25, en: "Are all food contact surfaces clean and free of encrusted debris?", es: "¿Todas las superficies en contacto con alimentos están limpias y libres de residuos incrustados?" },
          { id: 26, en: "Are all food contact surfaces/thermometer properly sanitized?", es: "¿Todas las superficies en contacto con alimentos/termómetros están correctamente desinfectadas?" },
          { id: 27, en: "Is the rice holding cabinet emptied and cleaned at the end of the night?", es: "¿El gabinete de retención de arroz se vacía y limpia al final de la noche?" },
        ],
      },
      {
        id: "water_sinks",
        en: "Water / Sinks",
        es: "Agua / Fregaderos",
        items: [
          { id: 28, en: "Is water available throughout the store?", es: "¿Hay agua disponible en toda la tienda?" },
          { id: 29, en: "Does the store have hot water of at least 120°F within 60 seconds at 1 location?", es: "¿La tienda tiene agua caliente de al menos 120°F en un lapso de 60 segundos en al menos 1 ubicación?" },
          { id: 30, en: "Do all hand sinks have hot water of >100°F within 60 seconds?", es: "¿Todos los lavamanos tienen agua caliente de más de 100°F en un lapso de 60 segundos?" },
          { id: 31, en: "Are all hand sinks easily accessible with nothing blocking them?", es: "¿Todos los lavamanos son fácilmente accesibles y no están obstruidos?" },
          { id: 32, en: "Are all handwashing sinks being used for handwashing only?", es: "¿Todos los lavamanos se usan exclusivamente para lavarse las manos?" },
          { id: 33, en: "Is the 1st basin of the three compartment sink >110°F when actively washing dishes?", es: "¿El primer compartimento del fregadero de tres compartimentos está a más de 110°F mientras se lavan los platos?" },
          { id: 34, en: "Are all hand sinks stocked with soap and paper towels?", es: "¿Todos los lavamanos están abastecidos con jabón y toallas de papel?" },
          { id: 35, en: "Are extra soap and paper towels available at the store?", es: "¿Hay jabón y toallas de papel adicionales disponibles en la tienda?" },
        ],
      },
    ],
  },
  {
    id: "employee_practices_group",
    en: "Employee Practices",
    es: "Prácticas de los Empleados",
    sections: [
      {
        id: "employee_practices",
        en: "Employee Practices",
        es: "Prácticas de los Empleados",
        items: [
          { id: 36, en: "Are gloves being worn if any associate has a bandage on or has an open wound?", es: "¿Se usan guantes si algún asociado tiene una venda o una herida abierta?" },
          { id: 37, en: "Are all associates in good health and visibly healthy?", es: "¿Todos los asociados están en buen estado de salud y visiblemente saludables?" },
          { id: 38, en: "Associates are washing hands with hot water (min. 100°F) for at least 20 seconds?", es: "¿Los asociados se lavan las manos con agua caliente (mínimo 100°F) durante al menos 20 segundos?" },
          { id: 39, en: "Are all associates washing their hands upon entering the kitchen area?", es: "¿Todos los asociados se lavan las manos al ingresar al área de cocina?" },
          { id: 40, en: "Are associates washing their hands when changing job duties or after touching any part of their body?", es: "¿Los asociados se lavan las manos al cambiar de tarea o después de tocarse cualquier parte del cuerpo?" },
          { id: 41, en: "All associates are eating, drinking, and smoking/vaping in an approved location?", es: "¿Todos los asociados comen, beben y fuman/vapean en un área aprobada?" },
          { id: 42, en: "All associate drinks have lids and straws and are stored below food in a designated area?", es: "¿Todas las bebidas de los asociados tienen tapa y popote, y se almacenan debajo de los alimentos en un área designada?" },
          { id: 43, en: "Are all temperature logs complete and accurate?", es: "¿Todos los registros de temperatura están completos y son precisos?", alwaysPhoto: true },
        ],
      },
      {
        id: "ppe",
        en: "Personal Protective Equipment and Hand Sanitizer",
        es: "Equipo de Protección Personal y Desinfectante de Manos",
        items: [
          { id: 44, en: "Are mask and gloves available for all associates?", es: "¿Hay mascarillas y guantes disponibles para todos los asociados?" },
          { id: 45, en: "Are all associates wearing mask properly?", es: "¿Todos los asociados usan la mascarilla correctamente?" },
          { id: 46, en: "Is hand sanitizer available? (For guest, cashier station)", es: "¿Hay desinfectante de manos disponible? (Para clientes, estación de caja)" },
        ],
      },
    ],
  },
  {
    id: "back_of_house",
    en: "Back of the House",
    es: "Área de Cocina / Preparación",
    sections: [
      {
        id: "operations",
        en: "Operations",
        es: "Operaciones",
        items: [
          { id: 47, en: "Are all bulk food containers properly labeled?", es: "¿Todos los contenedores de alimentos a granel están correctamente etiquetados?" },
          { id: 48, en: "Is food/equipment being prepared/stored in an approved area?", es: "¿Los alimentos/equipos se preparan/almacenan en un área aprobada?" },
          { id: 49, en: "Is produce washed before being prepared?", es: "¿Los productos frescos se lavan antes de prepararse?" },
          { id: 50, en: "Is the prep sink washed, rinsed and sanitized between every use?", es: "¿El fregadero de preparación se lava, enjuaga y desinfecta entre cada uso?" },
          { id: 51, en: "Are Chow Mein noodles warmed in the microwave and removed within 2 minutes?", es: "¿Los fideos Chow Mein se calientan en el microondas y se retiran en un lapso de 2 minutos?" },
          { id: 52, en: "Is food immediately removed from microwave?", es: "¿Los alimentos se retiran inmediatamente del microondas?" },
          { id: 53, en: "Are all in-use food container/utensils washed, rinsed, and sanitized at least every 4 hours?", es: "¿Todos los contenedores/utensilios de alimentos en uso se lavan, enjuagan y desinfectan al menos cada 4 horas?" },
        ],
      },
    ],
  },
  {
    id: "sanitizer_chemicals_group",
    en: "Sanitizer / Chemicals",
    es: "Desinfectante / Químicos",
    sections: [
      {
        id: "sanitizer_chemicals",
        en: "Sanitizer / Chemicals",
        es: "Desinfectante / Químicos",
        items: [
          { id: 54, en: "Is sanitizer available?", es: "¿Hay desinfectante disponible?" },
          { id: 55, en: "Is there a FOH designated sanitizer bucket available?", es: "¿Hay un balde de desinfectante designado para el área de atención al cliente (FOH)?" },
          { id: 56, en: "Are sanitizer strips available and not expired?", es: "¿Hay tiras de prueba de desinfectante disponibles y no vencidas?" },
          { id: 57, en: "Sanitizer buckets and dishsink/dishwasher between 150-400ppm sanitizer concentration?", es: "¿Los baldes de desinfectante y el fregadero/lavaplatos tienen una concentración de desinfectante entre 150-400ppm?" },
          { id: 58, en: "Are all chemical bottles properly labeled?", es: "¿Todas las botellas de químicos están correctamente etiquetadas?" },
          { id: 59, en: "Are all chemicals properly stored and away from all food/food prep areas?", es: "¿Todos los químicos están correctamente almacenados y alejados de las áreas de alimentos/preparación?" },
          { id: 60, en: "Are all chemicals approved for restaurant use?", es: "¿Todos los químicos están aprobados para uso en restaurantes?" },
        ],
      },
    ],
  },
  {
    id: "sewage_pest_group",
    en: "Sewage / Backflow & Pest Activity",
    es: "Aguas Residuales y Plagas",
    sections: [
      {
        id: "sewage_backflow",
        en: "Sewage / Backflow",
        es: "Aguas Residuales / Retorno de Agua",
        items: [
          { id: 61, en: "Are all floor drains, floor sinks, and toilets properly draining with no sewage overflowing?", es: "¿Todos los drenajes de piso, sumideros y inodoros drenan correctamente sin desbordamiento de aguas residuales?" },
          { id: 62, en: "Are employee restroom toilets working properly?", es: "¿Los inodoros del baño de empleados funcionan correctamente?" },
        ],
      },
      {
        id: "pest_activity",
        en: "Pest / Rodent Activity",
        es: "Actividad de Plagas / Roedores",
        items: [
          { id: 63, en: "Is the store free of all rodents, rodent droppings, gnaw marks or any other evidence of rodents?", es: "¿La tienda está libre de roedores, excremento de roedores, marcas de mordidas o cualquier otra evidencia de roedores?" },
          { id: 64, en: "Is the store free of all cockroaches, egg casings, or other evidence of cockroaches?", es: "¿La tienda está libre de cucarachas, ootecas (cápsulas de huevos) u otra evidencia de cucarachas?" },
          { id: 65, en: "Is the store free of flies?", es: "¿La tienda está libre de moscas?" },
        ],
      },
      {
        id: "other",
        en: "Other",
        es: "Otros",
        items: [
          { id: 66, en: "Is the microwave clean at all times?", es: "¿El microondas está limpio en todo momento?", alwaysPhoto: true },
          { id: 67, en: "Are ice machines free of mold at all times?", es: "¿Las máquinas de hielo están libres de moho en todo momento?", alwaysPhoto: true },
        ],
      },
    ],
  },
];

// Flat list of every item, in form order — used for progress counting,
// validation, and lookups by id.
const CHECKLIST_ITEMS_FLAT = CHECKLIST_GROUPS.flatMap((g) =>
  g.sections.flatMap((s) => s.items.map((it) => ({ ...it, sectionId: s.id, groupId: g.id })))
);

const CHECKLIST_TOTAL_ITEMS = CHECKLIST_ITEMS_FLAT.length; // 65
