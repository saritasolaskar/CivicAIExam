
import ComplaintCategory from "../models/ComplaintCategory.js";

export const resolveDepartment = async ({
  corporationId,
  categoryCode
}) => {
  if (!corporationId || !categoryCode) {
    throw new Error("Corporation and complaint category are required");
  }

  const category = await ComplaintCategory.findOne({
    corporation: corporationId,
    code: categoryCode.toUpperCase(),
    isActive: true
  }).populate("department");

  if (!category) {
    throw new Error("No active complaint category found for this corporation");
  }

  if (!category.department || !category.department.isActive) {
    throw new Error("The mapped department is inactive or unavailable");
  }

  if (
    category.department.corporation.toString() !==
    corporationId.toString()
  ) {
    throw new Error("Category and department corporation mismatch");
  }

  return {
    categoryId: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    departmentId: category.department._id,
    departmentName: category.department.name,
    departmentCode: category.department.code,
    corporationId
  };
};
