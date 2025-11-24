import { Request, Response } from 'express';
import { pgDataSource } from '../loaders/database';
import { Course } from '../models/Course';
import { Place } from '../models/Place';
import { Instructor } from '../models/Instructor';
import { badRequest, handleError, notFound } from '../utils/errorHandler';

// GET /api/courses - Lister tous les cours
export async function listCourses(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    
    const pgRepo = pgDataSource.getRepository(Course);
    const courses = await pgRepo.find({ 
      relations: ['place', 'instructor', 'place.category'] 
    });
    
    res.json(courses);
  } catch (err) {
    handleError(res, err, 'Failed to fetch courses');
  }
}

// GET /api/courses/:id - Récupérer un cours par ID
export async function getCourseById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const pgRepo = pgDataSource.getRepository(Course);
    const course = await pgRepo.findOne({
      where: { id },
      relations: ['place', 'instructor', 'place.category']
    });

    if (!course) {
      return notFound(res, 'Course not found');
    }

    res.json(course);
  } catch (err) {
    handleError(res, err, 'Failed to fetch course');
  }
}

// POST /api/courses - Créer un nouveau cours
export async function createCourse(req: Request, res: Response) {
  try {
    const { code, title, description, startAt, endAt, placeId, instructorId } = req.body;

    // Validation
    if (!code || !title) {
      return badRequest(res, 'Course code and title are required');
    }

    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const pgRepo = pgDataSource.getRepository(Course);
    
    // Vérifier si le code existe déjà
    const existingCourse = await pgRepo.findOne({ where: { code } });
    if (existingCourse) {
      return badRequest(res, 'Course with this code already exists');
    }

    // Récupérer le lieu (place) et l'instructeur avec gestion de null
    let place: Place | undefined = undefined;
    let instructor: Instructor | undefined = undefined;

    if (placeId) {
      const placeRepo = pgDataSource.getRepository(Place);
      const foundPlace = await placeRepo.findOne({ where: { id: placeId } });
      if (!foundPlace) {
        return notFound(res, 'Place not found');
      }
      place = foundPlace;
    }

    if (instructorId) {
      const instructorRepo = pgDataSource.getRepository(Instructor);
      const foundInstructor = await instructorRepo.findOne({ where: { id: instructorId } });
      if (!foundInstructor) {
        return notFound(res, 'Instructor not found');
      }
      instructor = foundInstructor;
    }

    // Création du cours avec typage explicite
    const courseData: Partial<Course> = {
      code,
      title,
      //description: description || undefined, // Gérer description optionnelle
      startAt: startAt ? new Date(startAt) : new Date(),
      endAt: endAt ? new Date(endAt) : new Date(Date.now() + 2 * 60 * 60 * 1000),
      place: place, // Déjà undefined si non trouvé
      instructor: instructor // Déjà undefined si non trouvé
    };

    const course = pgRepo.create(courseData);
    const savedCourse = await pgRepo.save(course);
    
    console.log(`✅ Course created: ${code} - ${title}`);
    res.status(201).json(savedCourse);
  } catch (err) {
    handleError(res, err, 'Failed to create course');
  }
}

// PUT /api/courses/:id - Mettre à jour un cours
export async function updateCourse(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { code, title, description, startAt, endAt, placeId, instructorId } = req.body;

    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const pgRepo = pgDataSource.getRepository(Course);
    const course = await pgRepo.findOne({
      where: { id },
      relations: ['place', 'instructor']
    });

    if (!course) {
      return notFound(res, 'Course not found');
    }

    // Vérifier les conflits de code (si le code change)
    if (code && code !== course.code) {
      const existingWithSameCode = await pgRepo.findOne({ where: { code } });
      if (existingWithSameCode) {
        return badRequest(res, 'Another course with this code already exists');
      }
    }

    // Récupérer le nouveau lieu et instructeur si fournis
    let place: Place | undefined = course.place || undefined;
    let instructor: Instructor | undefined = course.instructor || undefined;

    if (placeId !== undefined) {
      if (placeId === null) {
        place = undefined; // Supprimer la relation
      } else {
        const placeRepo = pgDataSource.getRepository(Place);
        const foundPlace = await placeRepo.findOne({ where: { id: placeId } });
        if (!foundPlace) {
          return notFound(res, 'Place not found');
        }
        place = foundPlace;
      }
    }

    if (instructorId !== undefined) {
      if (instructorId === null) {
        instructor = undefined; // Supprimer la relation
      } else {
        const instructorRepo = pgDataSource.getRepository(Instructor);
        const foundInstructor = await instructorRepo.findOne({ where: { id: instructorId } });
        if (!foundInstructor) {
          return notFound(res, 'Instructor not found');
        }
        instructor = foundInstructor;
      }
    }

    // Mise à jour avec typage explicite
    const updateData: Partial<Course> = {
      code: code || course.code,
      title: title || course.title,
     // description: description !== undefined ? description : course.description,
      startAt: startAt ? new Date(startAt) : course.startAt,
      endAt: endAt ? new Date(endAt) : course.endAt,
      place: place,
      instructor: instructor
    };

    pgRepo.merge(course, updateData);
    const updatedCourse = await pgRepo.save(course);
    
    console.log(`✅ Course updated: ${id}`);
    res.json(updatedCourse);
  } catch (err) {
    handleError(res, err, 'Failed to update course');
  }
}

// DELETE /api/courses/:id - Supprimer un cours
export async function deleteCourse(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const pgRepo = pgDataSource.getRepository(Course);
    const course = await pgRepo.findOne({ where: { id } });

    if (!course) {
      return notFound(res, 'Course not found');
    }

    await pgRepo.remove(course);
    
    console.log(`✅ Course deleted: ${id}`);
    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'Failed to delete course');
  }
}

// GET /api/courses/place/:placeId/today - Récupérer les cours d'un lieu pour aujourd'hui
export async function getCoursesForPlaceToday(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    
    const pgRepo = pgDataSource.getRepository(Course);
    const { placeId } = req.params;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const courses = await pgRepo
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.place', 'place')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .where('place.id = :placeId', { placeId })
      .andWhere('course.startAt BETWEEN :start AND :end', { 
        start: todayStart.toISOString(), 
        end: todayEnd.toISOString() 
      })
      .orderBy('course.startAt', 'ASC')
      .getMany();
    
    res.json(courses);
  } catch (err) {
    handleError(res, err, 'Failed to fetch courses for place today');
  }
}

// GET /api/courses/now - Récupérer les cours en cours actuellement
export async function getCoursesNow(req: Request, res: Response) {
  try {
    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }
    
    const pgRepo = pgDataSource.getRepository(Course);
    const now = new Date();
    
    const courses = await pgRepo
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.place', 'place')
      .leftJoinAndSelect('course.instructor', 'instructor')
      .leftJoinAndSelect('place.category', 'category')
      .where('course.startAt <= :now AND course.endAt >= :now', { 
        now: now.toISOString() 
      })
      .orderBy('course.startAt', 'ASC')
      .getMany();
    
    res.json(courses);
  } catch (err) {
    handleError(res, err, 'Failed to fetch current courses');
  }
}

// GET /api/courses/instructor/:instructorId - Récupérer les cours d'un instructeur
export async function getCoursesByInstructor(req: Request, res: Response) {
  try {
    const { instructorId } = req.params;

    if (!pgDataSource?.isInitialized) {
      return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
    }

    const pgRepo = pgDataSource.getRepository(Course);
    const courses = await pgRepo.find({
      where: { instructor: { id: instructorId } },
      relations: ['place', 'place.category'],
      order: { startAt: 'ASC' }
    });

    res.json(courses);
  } catch (err) {
    handleError(res, err, 'Failed to fetch instructor courses');
  }
}