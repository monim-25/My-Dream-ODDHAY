const QuestionBankAttempt = require('../models/QuestionBankAttempt');
const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const Course = require('../models/Course');
const User = require('../models/User');
const pushNotificationService = require('./pushNotificationService');

/**
 * Analyzes the user's exam and quiz attempts to identify topics where
 * accuracy is low or wrong answers are frequent.
 */
async function getUserWeakAreas(userId, options = {}) {
    try {
        if (!userId) return { hasData: false, weakTopics: [], moderateTopics: [], strongTopics: [], totalAnalyzed: 0, overallAccuracy: 100 };

        const limitAttempts = options.limitAttempts || 30;

        // 1. Fetch user data (enrolled courses, reminded topics, quiz results)
        const user = await User.findById(userId)
            .select('enrolledCourses remindedWeakTopics quizResults')
            .populate('quizResults.quiz', 'title subject classLevel questions')
            .lean();

        // 2. Fetch recent question bank attempts with answers populated
        const attempts = await QuestionBankAttempt.find({ user: userId })
            .sort({ submittedAt: -1 })
            .limit(limitAttempts)
            .populate({
                path: 'userAnswers.questionId',
                select: 'subject topic questionText questionType explanation'
            })
            .populate('bank', 'title subject topic course')
            .lean();

        const hasAttempts = attempts && attempts.length > 0;
        const hasQuizResults = user?.quizResults && user.quizResults.length > 0;

        if (!hasAttempts && !hasQuizResults) {
            return {
                hasData: false,
                weakTopics: [],
                moderateTopics: [],
                strongTopics: [],
                totalAnalyzed: 0,
                totalMistakes: 0,
                overallAccuracy: 0
            };
        }

        // 3. Aggregate by unique question or topic
        const seenQuestions = new Set();
        const topicMap = new Map();
        let totalMistakes = 0;
        let totalSkipped = 0;
        let totalQuestionsAnalyzed = 0;
        let totalCorrectAnswers = 0;

        if (hasAttempts) {
            for (const attempt of attempts) {
                const defaultSubject = attempt.bank?.subject || 'সাধারণ বিষয়';
                const defaultTopic = attempt.bank?.topic || attempt.bank?.title || 'অধ্যায়ভিত্তিক প্রস্তুতি';

                const answers = attempt.userAnswers || [];
                if (answers.length > 0) {
                    for (const ans of answers) {
                        const q = ans.questionId;
                        let qId = null;
                        if (q && q._id) qId = q._id.toString();
                        else if (ans.questionId) qId = ans.questionId.toString();
                        else if (ans._id) qId = ans._id.toString();

                        if (qId && seenQuestions.has(qId)) {
                            continue;
                        }
                        if (qId) seenQuestions.add(qId);

                        totalQuestionsAnalyzed++;
                        const isCorrect = Boolean(ans.isCorrect);
                        const isSkipped = !isCorrect && (ans.selectedOptionIndex === -1 || ans.selectedOptionIndex === undefined) && !ans.writtenAnswer;
                        const isWrong = !isCorrect && !isSkipped;

                        if (isCorrect) totalCorrectAnswers++;
                        else if (isWrong) totalMistakes++;
                        else totalSkipped++;

                        const subject = (q && q.subject) ? q.subject.trim() : defaultSubject;
                        let topic = (q && q.topic) ? q.topic.trim() : defaultTopic;
                        if (!topic) topic = defaultSubject + ' - সাধারণ আলোচনা';

                        const key = `${subject}:::${topic}`;
                        if (!topicMap.has(key)) {
                            topicMap.set(key, {
                                subject,
                                topic,
                                total: 0,
                                correct: 0,
                                wrong: 0,
                                skipped: 0,
                                marksObtained: 0,
                                maxMarks: 0,
                                bankIds: new Set()
                            });
                        }

                        const entry = topicMap.get(key);
                        entry.total++;
                        if (isCorrect) {
                            entry.correct++;
                        } else if (isWrong) {
                            entry.wrong++;
                        } else {
                            entry.skipped++;
                        }

                        const qMax = (typeof ans.maxMarks === 'number' && ans.maxMarks > 0) ? ans.maxMarks : 1;
                        const qEarned = (typeof ans.marksObtained === 'number' && !isNaN(ans.marksObtained))
                            ? Math.max(0, ans.marksObtained)
                            : (isCorrect ? qMax : 0);

                        entry.marksObtained += qEarned;
                        entry.maxMarks += qMax;

                        if (attempt.bank?._id) entry.bankIds.add(attempt.bank._id.toString());
                    }
                } else if (attempt.bank) {
                    // Fallback for attempt without populated userAnswers array
                    const key = `${defaultSubject}:::${defaultTopic}`;
                    if (!topicMap.has(key)) {
                        const total = attempt.totalBankQuestions || attempt.mcqTotalQuestions || 1;
                        const correct = attempt.mcqCorrectCount || 0;
                        const wrong = attempt.wrongMcqCount || Math.max(0, total - correct);
                        totalQuestionsAnalyzed += total;
                        totalCorrectAnswers += correct;
                        totalMistakes += wrong;

                        topicMap.set(key, {
                            subject: defaultSubject,
                            topic: defaultTopic,
                            total,
                            correct,
                            wrong,
                            skipped: 0,
                            marksObtained: attempt.mcqScore || 0,
                            maxMarks: attempt.maxMcqScore || total,
                            bankIds: new Set(attempt.bank._id ? [attempt.bank._id.toString()] : [])
                        });
                    }
                }
            }
        }

        // Also incorporate Quizzes from user.quizResults
        if (hasQuizResults) {
            for (const qr of user.quizResults) {
                if (!qr.quiz) continue;
                const qSubject = qr.quiz.subject || 'সাধারণ বিষয়';
                const qTopic = qr.quiz.title || 'কুইজ প্রস্তুতি';
                const key = `${qSubject}:::${qTopic}`;

                if (!topicMap.has(key)) {
                    const total = qr.total || (qr.quiz.questions?.length || 1);
                    const correct = qr.score || 0;
                    const wrong = Math.max(0, total - correct);
                    totalQuestionsAnalyzed += total;
                    totalCorrectAnswers += correct;
                    totalMistakes += wrong;

                    topicMap.set(key, {
                        subject: qSubject,
                        topic: qTopic,
                        total,
                        correct,
                        wrong,
                        skipped: 0,
                        marksObtained: correct,
                        maxMarks: total,
                        bankIds: new Set()
                    });
                }
            }
        }

        // Process into ranked topics
        const topics = [];
        for (const [_, entry] of topicMap.entries()) {
            const earned = Math.max(0, entry.marksObtained);
            const totalM = Math.max(1, entry.maxMarks);
            const accuracy = earned <= 0 ? 0 : Math.min(100, Math.round((earned / totalM) * 100));

            let status = 'strong'; // >= 60%
            if (accuracy < 40 || ((entry.wrong + entry.skipped) >= 2 && accuracy < 50)) {
                status = 'critical'; // < 40%
            } else if (accuracy < 60) {
                status = 'moderate'; // 40% - 59%
            }

            topics.push({
                subject: entry.subject,
                topic: entry.topic,
                total: entry.total,
                correct: entry.correct,
                wrong: entry.wrong,
                skipped: entry.skipped,
                marksObtained: parseFloat(earned.toFixed(1)),
                maxMarks: parseFloat(totalM.toFixed(1)),
                accuracy,
                status,
                bankIds: Array.from(entry.bankIds)
            });
        }

        // Sort: Critical first, then Moderate, then Strong
        topics.sort((a, b) => {
            if (a.status === 'critical' && b.status !== 'critical') return -1;
            if (b.status === 'critical' && a.status !== 'critical') return 1;
            if (a.status === 'moderate' && b.status === 'strong') return -1;
            if (b.status === 'moderate' && a.status === 'strong') return 1;
            return a.accuracy - b.accuracy || (b.wrong + b.skipped) - (a.wrong + a.skipped);
        });

        // Mark reminded status without removing topics from the student's dashboard
        const remindedTopicsSet = new Set(
            (user?.remindedWeakTopics || []).map(r => (r.topic || '').trim().toLowerCase())
        );

        for (const t of topics) {
            t.isReminded = remindedTopicsSet.has(t.topic.trim().toLowerCase());
        }

        const weakTopics = topics.filter(t => t.status === 'critical');
        const moderateTopics = topics.filter(t => t.status === 'moderate');
        const strongTopics = topics.filter(t => t.status === 'strong');

        // Target topics for revision lessons: includes weak, moderate, and any active exam topics
        const targetTopics = [...weakTopics, ...moderateTopics, ...strongTopics].slice(0, 6);

        if (targetTopics.length > 0) {
            const enrolledCourseIds = (user?.enrolledCourses || []).map(e => e.course).filter(Boolean);

            const courses = await Course.find({
                $or: [
                    { _id: { $in: enrolledCourseIds } },
                    { accessType: 'free' }
                ]
            }).select('title subject thumbnail curriculumNodes chapters').lean();

            for (const t of targetTopics) {
                let matchedLesson = null;
                const cleanTopic = t.topic.split(/[,:\-–]/)[0].trim();
                const searchRegex = new RegExp(escapeRegex(cleanTopic), 'i');
                const subjectRegex = new RegExp(escapeRegex(t.subject), 'i');

                // Check enrolled courses first
                for (const course of courses) {
                    const courseSubjects = Array.isArray(course.subject)
                        ? course.subject
                        : (course.subject ? [course.subject] : []);
                    const courseMatchesSubject = courseSubjects.some(s => subjectRegex.test(String(s))) ||
                                                 searchRegex.test(course.title || '');

                    // Check curriculum nodes
                    for (const node of (course.curriculumNodes || [])) {
                        if (node.type === 'video' && (searchRegex.test(node.name) || (courseMatchesSubject && searchRegex.test(node.description || '')))) {
                            matchedLesson = {
                                courseId: course._id,
                                courseTitle: course.title,
                                lessonId: node._id,
                                lessonTitle: node.name,
                                thumbnail: node.thumbnail || course.thumbnail,
                                topic: t.topic,
                                subject: t.subject
                            };
                            break;
                        }
                    }
                    if (matchedLesson) break;

                    // Check chapters
                    for (const ch of (course.chapters || [])) {
                        if (searchRegex.test(ch.title) && ch.recordedClasses?.length > 0) {
                            const rc = ch.recordedClasses[0];
                            matchedLesson = {
                                courseId: course._id,
                                courseTitle: course.title,
                                lessonId: rc._id,
                                lessonTitle: rc.title,
                                thumbnail: course.thumbnail,
                                topic: t.topic,
                                subject: t.subject
                            };
                            break;
                        }
                    }
                    if (matchedLesson) break;
                }

                // If no exact video found, provide fallback course or question bank link
                t.revisionLink = matchedLesson
                    ? `/course-details/${matchedLesson.courseId}?lesson=${matchedLesson.lessonId}`
                    : (t.bankIds.length > 0 ? `/exams` : `/courses`);
                t.matchedLesson = matchedLesson;
            }
        }

        const overallAccuracy = totalQuestionsAnalyzed > 0
            ? Math.round((totalCorrectAnswers / totalQuestionsAnalyzed) * 100)
            : 0;

        return {
            hasData: totalQuestionsAnalyzed > 0,
            weakTopics,
            moderateTopics,
            strongTopics,
            allTopicsCount: topics.length,
            totalAnalyzed: totalQuestionsAnalyzed,
            totalMistakes,
            totalSkipped,
            overallAccuracy
        };
    } catch (err) {
        console.error('Error in getUserWeakAreas:', err);
        return {
            hasData: false,
            weakTopics: [],
            moderateTopics: [],
            strongTopics: [],
            totalAnalyzed: 0,
            totalMistakes: 0,
            overallAccuracy: 0
        };
    }
}

/**
 * Creates an in-app and push reminder for a specific topic
 */
async function scheduleRevisionReminder(userId, topicName, subjectName, link, scoreDetails = null, delayMinutes = 0) {
    try {
        const title = `📖 রিভিশন ও প্র্যাকটিস রিমাইন্ডার: ${topicName}`;
        const prefix = subjectName ? `${subjectName} • ` : '';
        
        let body;
        if (scoreDetails && scoreDetails.score !== undefined && scoreDetails.maxScore !== undefined) {
            body = `${prefix}আপনি "${topicName}"-এ ${scoreDetails.score}/${scoreDetails.maxScore} নম্বর পেয়েছেন। বিষয়টি ভালোভাবে রিভিশন দিন, লেকচার পড়ুন অথবা কুইজে পুনরায় অংশ নিয়ে প্রস্তুতি নিখুঁত করুন!`;
        } else {
            body = `${prefix}"${topicName}" অধ্যায়টি ভালোভাবে রিভিশন দিন, লেকচার পড়ুন অথবা কুইজে পুনরায় অংশ নিয়ে প্রস্তুতি নিখুঁত করুন!`;
        }

        const url = link || '/exams';
        const parsedDelay = parseInt(delayMinutes, 10) || 0;

        // Persist that a reminder was set for this weak topic so it is not shown in the Weak Area Radar anymore
        if (userId && topicName) {
            try {
                await User.findByIdAndUpdate(userId, {
                    $push: {
                        remindedWeakTopics: {
                            topic: topicName.trim(),
                            subject: subjectName ? subjectName.trim() : '',
                            remindedAt: new Date()
                        }
                    }
                });
            } catch (uErr) {
                console.error('Error updating remindedWeakTopics for user:', uErr);
            }
        }

        // If a future delay is requested (e.g. 30 mins, 1 hour, etc.)
        if (parsedDelay > 0) {
            const scheduledAt = new Date(Date.now() + parsedDelay * 60 * 1000);
            const NotificationLog = require('../models/NotificationLog');
            const scheduledLog = await NotificationLog.create({
                user: userId,
                title,
                body,
                url,
                type: 'reminder',
                priority: 'urgent',
                status: 'scheduled',
                scheduledAt
            });

            // For delays up to 2 hours, also schedule an in-memory precision timer
            if (parsedDelay <= 120) {
                setTimeout(async () => {
                    try {
                        const existingLog = await NotificationLog.findById(scheduledLog._id);
                        if (existingLog && existingLog.status === 'scheduled') {
                            await pushNotificationService.sendToUser(userId, {
                                title,
                                body,
                                type: 'reminder',
                                url,
                                priority: 'urgent'
                            });
                            existingLog.status = 'sent';
                            existingLog.sent = 1;
                            await existingLog.save();
                        }
                    } catch (timerErr) {
                        console.error('Scheduled reminder in-memory timer error:', timerErr);
                    }
                }, parsedDelay * 60 * 1000);
            }

            return { success: true, scheduled: true, scheduledAt, delayMinutes: parsedDelay };
        }

        // Instant send
        return await pushNotificationService.sendToUser(userId, {
            title,
            body,
            type: 'reminder',
            url,
            priority: 'urgent'
        });
    } catch (err) {
        console.error('Error scheduling revision reminder:', err);
        return { success: false, error: err.message };
    }
}

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

module.exports = {
    getUserWeakAreas,
    scheduleRevisionReminder
};
