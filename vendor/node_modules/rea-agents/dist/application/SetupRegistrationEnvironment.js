/** Preserve adapter-published settings independently of runtime readiness. */
export const providerRegistrationEnvironment = (inspections) => Object.fromEntries(inspections
    .flatMap(({ registrationEnvironment }) => Object.entries(registrationEnvironment))
    .sort(([left], [right]) => left.localeCompare(right)));
