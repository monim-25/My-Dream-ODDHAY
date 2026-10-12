/**
 * Profile Completion Utility
 * Computes profile completeness percentage and next actionable steps for students.
 */

function getProfileCompletion(user) {
    if (!user) {
        return {
            percentage: 0,
            completedCount: 0,
            totalCount: 8,
            checks: [],
            missingChecks: [],
            nextAction: null,
            isComplete: false
        };
    }

    const checks = [
        {
            key: 'name',
            title: 'Full Name',
            done: Boolean(user.name && user.name.trim()),
            icon: 'person',
            hint: 'Provide your full name',
            actionUrl: '/profile/edit#name'
        },
        {
            key: 'phone',
            title: 'Phone Number',
            done: Boolean(user.phone && user.phone.trim()),
            icon: 'call',
            hint: 'Add contact phone number for security & alerts',
            actionUrl: '/profile/edit#phone'
        },
        {
            key: 'email',
            title: 'Email Address',
            done: Boolean(user.email && user.email.trim()),
            icon: 'mail',
            hint: 'Add your email address for account recovery',
            actionUrl: '/profile/edit#email'
        },
        {
            key: 'classLevel',
            title: 'Class / Level',
            done: Boolean(user.classLevel && user.classLevel.trim()),
            icon: 'school',
            hint: 'Select your class/grade level (e.g. Class 10, HSC)',
            actionUrl: '/profile/edit#classLevel'
        },
        {
            key: 'profileImage',
            title: 'Profile Photo',
            done: Boolean((user.profileImage || user.profilePicture) && !(user.profileImage || user.profilePicture).includes('default-avatar')),
            icon: 'photo_camera',
            hint: 'Upload your photo for your student ID card',
            actionUrl: '/profile/edit#avatar'
        },
        {
            key: 'institution',
            title: 'School or College',
            done: Boolean((user.schoolName && user.schoolName.trim()) || (user.collegeName && user.collegeName.trim())),
            icon: 'domain',
            hint: 'Enter your school or college name',
            actionUrl: '/profile/edit#schoolName'
        },
        {
            key: 'address',
            title: 'Present Address',
            done: Boolean((user.presentAddress && user.presentAddress.trim()) || (user.permanentAddress && user.permanentAddress.trim()) || (user.address && user.address.trim())),
            icon: 'home_pin',
            hint: 'Add your present address for records',
            actionUrl: '/profile/edit#presentAddress'
        },
        {
            key: 'guardian',
            title: 'Guardian Information',
            done: Boolean((user.guardianName && user.guardianName.trim()) || (user.guardianPhone && user.guardianPhone.trim())),
            icon: 'family_restroom',
            hint: 'Link guardian contact details',
            actionUrl: '/profile/edit#guardian'
        }
    ];

    const completedChecks = checks.filter(c => c.done);
    const missingChecks = checks.filter(c => !c.done);
    const percentage = Math.round((completedChecks.length / checks.length) * 100);
    const nextAction = missingChecks.length > 0 ? missingChecks[0] : null;

    return {
        percentage,
        completedCount: completedChecks.length,
        totalCount: checks.length,
        checks,
        missingChecks,
        nextAction,
        isComplete: percentage >= 100
    };
}

module.exports = {
    getProfileCompletion
};
