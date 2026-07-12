from enum import Enum


class Gender(str, Enum):
    male = "male"
    female = "female"


class ActivityLevel(str, Enum):
    sedentary = "sedentary"
    lightly_active = "lightly_active"
    moderately_active = "moderately_active"
    very_active = "very_active"
    extra_active = "extra_active"


ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "lightly_active": 1.375,
    "moderately_active": 1.55,
    "very_active": 1.725,
    "extra_active": 1.9,
}


def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    if not height_cm or height_cm <= 0:
        return 0.0
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


def get_bmi_category(bmi: float) -> str:
    if bmi < 18.5:
        return "תת משקל"
    if bmi < 25:
        return "משקל תקין"
    if bmi < 30:
        return "עודף משקל"
    return "השמנה"


def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    # Mifflin-St Jeor
    if gender == "male":
        return round(10 * weight_kg + 6.25 * height_cm - 5 * age + 5)
    return round(10 * weight_kg + 6.25 * height_cm - 5 * age - 161)


def calculate_tdee(bmr: float, activity_level: str) -> float:
    return round(bmr * ACTIVITY_MULTIPLIERS.get(activity_level, 1.2))


def calculate_target_calories(tdee: float, goal: str) -> float:
    adjustments = {
        "weight_loss": -500,
        "muscle_gain": +300,
        "maintenance": 0,
        "fitness_improvement": -200,
    }
    return round(tdee + adjustments.get(goal, 0))


def calculate_all_metrics(weight_kg, height_cm, age, gender, activity_level, goal):
    bmi = calculate_bmi(weight_kg, height_cm)
    bmr = calculate_bmr(weight_kg, height_cm, age, gender)
    tdee = calculate_tdee(bmr, activity_level)
    target_calories = calculate_target_calories(tdee, goal)
    return {
        "bmi": bmi,
        "bmi_category": get_bmi_category(bmi),
        "bmr": bmr,
        "tdee": tdee,
        "target_calories": target_calories,
    }
