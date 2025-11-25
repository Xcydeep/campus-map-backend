import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();
import { connectDatabases, pgDataSource, sqliteDataSource } from '../loaders/database';
import bcrypt from 'bcrypt';
import { Category } from '../models/Category';
import { CategoryLite } from '../models/CategoryLite';
import { Place } from '../models/Place';
import { PlaceLite } from '../models/PlaceLite';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Instructor } from '../models/Instructor';

async function seed() {
  await connectDatabases();
  
  if (!sqliteDataSource.isInitialized) {
    console.error('SQLite database not initialized');
    return;
  }
  
  if (!pgDataSource || !pgDataSource.isInitialized) {
    console.warn('PostgreSQL DataSource not initialized; skipping PostgreSQL seed data insertion');
    return;
  }

  // === CATÉGORIES COMPLÈTES D'UN CAMPUS ===
  const pgCatRepo = pgDataSource.getRepository(Category);
  const sqliteCatRepo = sqliteDataSource.getRepository(CategoryLite); // CategoryLite pour SQLite

  const campusCategories = [
    'Restaurant', 'Bureau', 'Laboratoire', 'Terrain', 'Arrêt de bus',
    'Statue rector', 'Espace libre', 'Route', 'Salle de cours', 'Amphithéâtre',
    'Bibliothèque', 'Parking', 'Jardin', 'Sport', 'Administration', 'Infirmerie',
    'Résidence étudiante', 'Cafétéria', 'Librairie', 'Centre informatique',
    'Auditorium', 'Salle de conférence', 'Atelier', 'Salle de musique', 'Salle de danse',
    'Piscine', 'Gymnase', 'Court de tennis', 'Terrain de football', 'Basketball',
    'Volleyball', 'Centre médical', 'Chapelle', 'Espace détente', 'Machine à café',
    'Distributeur automatique', 'Toilettes', 'Ascenseur', 'Escalier', 'Hall d\'entrée'
  ];

  console.log('🌱 Creating campus categories...');
  for (const name of campusCategories) {
    let pgCategory = await pgCatRepo.findOne({ where: { name } });
    if (!pgCategory) {
      pgCategory = pgCatRepo.create({ name });
      await pgCatRepo.save(pgCategory);
      console.log(`✅ Created PostgreSQL category: ${name}`);
    }
    
    let sqliteCategory = await sqliteCatRepo.findOne({ where: { name } });
    if (!sqliteCategory) {
      sqliteCategory = sqliteCatRepo.create({ 
        id: pgCategory.id,
        name 
      });
      await sqliteCatRepo.save(sqliteCategory);
      console.log(`✅ Created SQLite CategoryLite: ${name}`);
    }
  }

  // === LIEUX (PLACES) PAR CATÉGORIE ===
  const pgPlaceRepo = pgDataSource.getRepository(Place);
  const sqlitePlaceRepo = sqliteDataSource.getRepository(PlaceLite);

  // Récupérer toutes les catégories
  const categories = await pgCatRepo.find();
  const sqliteCategories = await sqliteCatRepo.find();

  const getCategory = (name: string) => categories.find(c => c.name === name);
  const getSqliteCategory = (name: string) => sqliteCategories.find(c => c.name === name);

  // Données des lieux par catégorie
  const campusPlaces = [
    // 🏛️ ADMINISTRATION
    {
      name: 'Bâtiment Administratif Principal',
      description: 'Siège de l\'administration du campus',
      latitude: 48.858844,
      longitude: 2.294351,
      category: getCategory('Administration'),
      code: 'ADM-MAIN',
      building: 'Bâtiment Administratif',
      floor: 'RDC-2'
    },
    {
      name: 'Bureau du Recteur',
      description: 'Bureau officiel du recteur de l\'université',
      latitude: 48.858840,
      longitude: 2.294355,
      category: getCategory('Bureau'),
      code: 'ADM-RECT',
      building: 'Bâtiment Administratif',
      floor: '2'
    },

    // 🎓 ENSEIGNEMENT
    {
      name: 'Amphithéâtre Descartes',
      description: 'Grand amphithéâtre de 500 places',
      latitude: 48.859000,
      longitude: 2.294500,
      category: getCategory('Amphithéâtre'),
      code: 'AMP-DESC',
      capacity: 500,
      building: 'Bâtiment des Sciences',
      floor: 'RDC'
    },
    {
      name: 'Salle de Cours A-101',
      description: 'Salle de cours standard',
      latitude: 48.859100,
      longitude: 2.294600,
      category: getCategory('Salle de cours'),
      code: 'SC-A101',
      capacity: 30,
      building: 'Bâtiment A',
      floor: '1'
    },
    {
      name: 'Laboratoire Informatique B201',
      description: 'Laboratoire équipé de 30 postes informatiques',
      latitude: 48.859200,
      longitude: 2.294700,
      category: getCategory('Laboratoire'),
      code: 'LAB-INFO-B201',
      capacity: 30,
      building: 'Bâtiment B',
      floor: '2'
    },
    {
      name: 'Bibliothèque Centrale',
      description: 'Bibliothèque principale du campus',
      latitude: 48.858900,
      longitude: 2.294200,
      category: getCategory('Bibliothèque'),
      code: 'BIB-MAIN',
      building: 'Bâtiment Culturel',
      floor: 'RDC-3'
    },

    // 🍽️ RESTAURATION
    {
      name: 'Restaurant Universitaire Central',
      description: 'Restaurant principal du CROUS',
      latitude: 48.858500,
      longitude: 2.294000,
      category: getCategory('Restaurant'),
      code: 'RU-CENTRAL',
      capacity: 300,
      building: 'Bâtiment Social',
      floor: 'RDC'
    },
    {
      name: 'Cafétéria Sciences',
      description: 'Cafétéria du bâtiment des sciences',
      latitude: 48.859300,
      longitude: 2.294800,
      category: getCategory('Cafétéria'),
      code: 'CAFE-SCIENCES',
      capacity: 80,
      building: 'Bâtiment des Sciences',
      floor: 'RDC'
    },

    // 🏀 SPORTS
    {
      name: 'Gymnase Principal',
      description: 'Gymnase multisports',
      latitude: 48.858000,
      longitude: 2.293500,
      category: getCategory('Gymnase'),
      code: 'GYM-MAIN',
      capacity: 200,
      building: 'Complexe Sportif',
      floor: 'RDC'
    },
    {
      name: 'Piscine Universitaire',
      description: 'Piscine semi-olympique',
      latitude: 48.857800,
      longitude: 2.293300,
      category: getCategory('Piscine'),
      code: 'PISCINE-UNIV',
      building: 'Complexe Sportif',
      floor: 'RDC'
    },
    {
      name: 'Terrain de Football',
      description: 'Terrain de football en gazon naturel',
      latitude: 48.857500,
      longitude: 2.293000,
      category: getCategory('Terrain de football'),
      code: 'TERRAIN-FOOT',
      building: 'Complexe Sportif Extérieur'
    },
    {
      name: 'Court de Tennis A',
      description: 'Court de tennis extérieur',
      latitude: 48.857600,
      longitude: 2.293200,
      category: getCategory('Court de tennis'),
      code: 'TENNIS-A',
      building: 'Complexe Sportif Extérieur'
    },

    // 🚌 TRANSPORTS & SERVICES
    {
      name: 'Arrêt de Bus Principal',
      description: 'Arrêt de bus principal du campus',
      latitude: 48.858300,
      longitude: 2.293800,
      category: getCategory('Arrêt de bus'),
      code: 'BUS-MAIN'
    },
    {
      name: 'Parking Visiteurs',
      description: 'Parking réservé aux visiteurs',
      latitude: 48.858200,
      longitude: 2.293700,
      category: getCategory('Parking'),
      code: 'PARK-VISITEURS',
      capacity: 100
    },
    {
      name: 'Parking Étudiants',
      description: 'Parking principal des étudiants',
      latitude: 48.858100,
      longitude: 2.293600,
      category: getCategory('Parking'),
      code: 'PARK-ETUDIANTS',
      capacity: 300
    },

    // 🏥 SANTÉ
    {
      name: 'Infirmerie Universitaire',
      description: 'Service de santé universitaire',
      latitude: 48.858700,
      longitude: 2.294100,
      category: getCategory('Infirmerie'),
      code: 'INFIRMERIE',
      building: 'Bâtiment Social',
      floor: '1'
    },
    {
      name: 'Centre Médical',
      description: 'Centre médical du campus',
      latitude: 48.858650,
      longitude: 2.294050,
      category: getCategory('Centre médical'),
      code: 'MEDICAL-CTR',
      building: 'Bâtiment Social',
      floor: '1'
    },

    // 🏠 HÉBERGEMENT
    {
      name: 'Résidence Descartes',
      description: 'Résidence étudiante de 200 places',
      latitude: 48.858400,
      longitude: 2.294900,
      category: getCategory('Résidence étudiante'),
      code: 'RES-DESCARTES',
      capacity: 200,
      building: 'Résidence Descartes',
      floor: '1-5'
    },

    // 🌳 ESPACES VERTS
    {
      name: 'Jardin Central',
      description: 'Jardin paysager du campus',
      latitude: 48.858600,
      longitude: 2.294300,
      category: getCategory('Jardin'),
      code: 'JARDIN-CENTRAL'
    },
    {
      name: 'Espace Détente Nord',
      description: 'Espace de détente avec bancs',
      latitude: 48.858800,
      longitude: 2.294400,
      category: getCategory('Espace détente'),
      code: 'DETENTE-NORD'
    },

    // 🛒 SERVICES
    {
      name: 'Librairie Universitaire',
      description: 'Librairie et papeterie',
      latitude: 48.858950,
      longitude: 2.294250,
      category: getCategory('Librairie'),
      code: 'LIBRAIRIE-UNIV',
      building: 'Bâtiment Culturel',
      floor: 'RDC'
    },
    {
      name: 'Centre Informatique',
      description: 'Centre de ressources informatiques',
      latitude: 48.859050,
      longitude: 2.294350,
      category: getCategory('Centre informatique'),
      code: 'INFO-CTR',
      building: 'Bâtiment des Sciences',
      floor: '1'
    },

    // 🎭 CULTURE & LOISIRS
    {
      name: 'Auditorium Culturel',
      description: 'Auditorium pour événements culturels',
      latitude: 48.858750,
      longitude: 2.294150,
      category: getCategory('Auditorium'),
      code: 'AUDITORIUM-CULT',
      capacity: 250,
      building: 'Bâtiment Culturel',
      floor: 'RDC'
    },
    {
      name: 'Salle de Musique',
      description: 'Salle de pratique musicale',
      latitude: 48.858850,
      longitude: 2.294250,
      category: getCategory('Salle de musique'),
      code: 'MUSIQUE-101',
      building: 'Bâtiment Culturel',
      floor: '1'
    },

    // 🗿 MONUMENTS
    {
      name: 'Statue du Recteur Fondateur',
      description: 'Statue en bronze du premier recteur',
      latitude: 48.858820,
      longitude: 2.294320,
      category: getCategory('Statue rector'),
      code: 'STATUE-RECTEUR'
    }
  ];

  console.log('🏫 Creating campus places...');
  for (const placeData of campusPlaces) {
    if (!placeData.category) {
      console.warn(`⚠️  Category not found for place: ${placeData.name}`);
      continue;
    }

    // PostgreSQL - Recherche par code
    let pgPlace = await pgPlaceRepo.findOne({ where: { code: placeData.code } });
    if (!pgPlace) {
      pgPlace = pgPlaceRepo.create({
        name: placeData.name,
        description: placeData.description,
        latitude: placeData.latitude,
        longitude: placeData.longitude,
        category: placeData.category,
        capacity: placeData.capacity,
        building: placeData.building,
        floor: placeData.floor,
        code: placeData.code
      });
      await pgPlaceRepo.save(pgPlace);
      console.log(`📍 Created PostgreSQL place: ${placeData.name}`);
    }

    // SQLite - Utilisation de PlaceLite avec CategoryLite
    const sqliteCategory = getSqliteCategory(placeData.category.name);
    if (sqliteCategory && pgPlace) {
      let sqlitePlace = await sqlitePlaceRepo.findOne({ where: { name: placeData.name } });
      if (!sqlitePlace) {
        sqlitePlace = sqlitePlaceRepo.create({
          id: pgPlace.id,
          name: placeData.name,
          latitude: placeData.latitude,
          longitude: placeData.longitude,
          category: sqliteCategory
          // Note: PlaceLite n'a pas les champs description, capacity, building, floor, code, etc.
        });
        await sqlitePlaceRepo.save(sqlitePlace);
        console.log(`📍 Created SQLite PlaceLite: ${placeData.name}`);
      }
    }
  }

  // === INSTRUCTEURS === (PostgreSQL seulement)
  const pgInstructorRepo = pgDataSource.getRepository(Instructor);
      
  const instructorsData = [
    {
      name: 'Dr. Sophie Martin',
      email: 'sophie.martin@univ.fr'
    },
    {
      name: 'Prof. Jean Dupont',
      email: 'jean.dupont@univ.fr'
    },
    {
      name: 'Dr. Marie Lambert',
      email: 'marie.lambert@univ.fr'
    },
    {
      name: 'Prof. Ahmed Benali',
      email: 'ahmed.benali@univ.fr'
    },
    {
      name: 'Dr. Elena Rodriguez',
      email: 'elena.rodriguez@univ.fr'
    }
  ];

  console.log('👨‍🏫 Creating instructors...');
  for (const instructorData of instructorsData) {
    let instructor = await pgInstructorRepo.findOne({ where: { email: instructorData.email } });
    if (!instructor) {
      instructor = pgInstructorRepo.create(instructorData);
      await pgInstructorRepo.save(instructor);
      console.log(`✅ Created instructor: ${instructorData.name}`);
    }
  }

  // Mettre à jour les offices après création des instructeurs
  console.log('🏢 Assigning offices to instructors...');
  const officeAssignments = [
    { instructorEmail: 'sophie.martin@univ.fr', officeCode: 'ADM-RECT' },
    { instructorEmail: 'jean.dupont@univ.fr', officeCode: 'SC-A101' },
    { instructorEmail: 'marie.lambert@univ.fr', officeCode: 'LAB-INFO-B201' }
  ];

  for (const assignment of officeAssignments) {
    const instructor = await pgInstructorRepo.findOne({ where: { email: assignment.instructorEmail } });
    const office = await pgPlaceRepo.findOne({ where: { code: assignment.officeCode } });
    
    if (instructor && office) {
      office.instructor = instructor;
      await pgPlaceRepo.save(office);
      console.log(`✅ Assigned office ${assignment.officeCode} to ${assignment.instructorEmail}`);
    }
  }

  // === COURS === (PostgreSQL seulement)
  const pgCourseRepo = pgDataSource.getRepository(Course);
  
  const coursesData = [
    {
      code: 'INF101',
      title: 'Introduction à la Programmation',
      description: 'Fondements de la programmation en Python',
      placeCode: 'LAB-INFO-B201',
      instructorEmail: 'sophie.martin@univ.fr'
    },
    {
      code: 'MAT201',
      title: 'Algèbre Linéaire',
      description: 'Espaces vectoriels et applications linéaires',
      placeCode: 'SC-A101',
      instructorEmail: 'jean.dupont@univ.fr'
    },
    {
      code: 'PHY301',
      title: 'Mécanique Quantique',
      description: 'Introduction à la physique quantique',
      placeCode: 'AMP-DESC',
      instructorEmail: 'marie.lambert@univ.fr'
    }
  ];

  console.log('📚 Creating courses...');
  for (const courseData of coursesData) {
    const place = await pgPlaceRepo.findOne({ where: { code: courseData.placeCode } });
    const instructor = await pgInstructorRepo.findOne({ where: { email: courseData.instructorEmail } });

    if (!place || !instructor) {
      console.warn(`⚠️  Missing place or instructor for course: ${courseData.code}`);
      continue;
    }

    let course = await pgCourseRepo.findOne({ where: { code: courseData.code } });
    if (!course) {
      const startAt = new Date();
      const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000); // +2 heures
      
      course = pgCourseRepo.create({
        code: courseData.code,
        title: courseData.title,
        startAt,
        endAt,
        place: place,
        instructor: instructor
      });
      await pgCourseRepo.save(course);
      console.log(`✅ Created course: ${courseData.code} - ${courseData.title}`);
    }
  }

  // === UTILISATEUR ADMIN === (PostgreSQL seulement)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mapdang.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const userRepo = pgDataSource.getRepository(User);
  
  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    admin = userRepo.create({ 
      email: adminEmail, 
      passwordHash: hash, 
      isAdmin: true 
    });
    await userRepo.save(admin);
    console.log('🔑 Admin user created:', adminEmail, 'password:', adminPassword);
  } else {
    console.log('ℹ️  Admin user already exists:', adminEmail);
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log(`📊 Created ${campusCategories.length} categories (PostgreSQL + SQLite CategoryLite)`);
  console.log(`🏛️  Created ${campusPlaces.length} places (PostgreSQL + SQLite PlaceLite)`);
  console.log(`👨‍🏫 Created ${instructorsData.length} instructors (PostgreSQL only)`);
  console.log(`📚 Created ${coursesData.length} courses (PostgreSQL only)`);
  console.log('\n📋 Database Summary:');
  console.log('   PostgreSQL: All entities with complete relations');
  console.log('   SQLite: CategoryLite + PlaceLite only (offline mode)');

  process.exit(0);
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});